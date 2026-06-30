<?php
/**
 * refresh-prices.php — server-side price refresher (runs from a DirectAdmin cron).
 *
 * Why this exists: GitHub Actions throttles high-frequency scheduled crons to
 * roughly once every few hours, so the published prices.json went stale. A cron
 * on our own server runs reliably on time. This script fetches spot prices
 * (gold-api.com, keyless) + FX (open.er-api.com, keyless) and writes prices.json
 * + intraday.json next to itself, mirroring the Node pipeline's schema, the
 * day-change ("open") logic, the intraday rolling buffer and source failover,
 * so the site reads the files unchanged.
 *
 * Cron (every 10 min), in DirectAdmin → Advanced → Cron Jobs:
 *   php /home/USER/domains/preciousmetalscharts.com/public_html/refresh-prices.php >/dev/null 2>&1
 *
 * Manual test from a browser:  /refresh-prices.php?key=<WEB_TRIGGER_KEY>
 */

// ---- access guard: CLI (cron) always allowed; web only with a matching key ----
const WEB_TRIGGER_KEY = 'a982797fa7e08408ded09815137aac75'; // for manual URL test; cron uses CLI and ignores this
if (PHP_SAPI !== 'cli') {
  $k = isset($_GET['key']) ? (string)$_GET['key'] : '';
  if (WEB_TRIGGER_KEY === '' || !hash_equals(WEB_TRIGGER_KEY, $k)) { http_response_code(403); exit("forbidden\n"); }
  header('Content-Type: text/plain; charset=utf-8');
}

$DIR   = __DIR__;
$SNAP  = $DIR . '/prices.json';
$INTRA = $DIR . '/intraday.json';
$CFG   = $DIR . '/prices-config.php'; // optional: return ['metalpriceapi_key' => '...'];

$METALS = ['gold' => 'XAU', 'silver' => 'XAG', 'platinum' => 'XPT', 'palladium' => 'XPD'];
$FX_CCY = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD'];

function httpGet($url, $timeout = 12) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => $timeout,
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_USERAGENT      => 'preciousmetalscharts-refresh/1.0 (+https://preciousmetalscharts.com)',
  ]);
  $body = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($body === false || $code < 200 || $code >= 300) return null;
  return $body;
}
function getJSON($url, $timeout = 12) { $b = httpGet($url, $timeout); if ($b === null) return null; $j = json_decode($b, true); return is_array($j) ? $j : null; }
function readJSON($p) { if (!is_file($p)) return null; $j = json_decode(@file_get_contents($p), true); return is_array($j) ? $j : null; }
function writeJSONAtomic($p, $data) {
  $tmp = $p . '.tmp' . getmypid();
  if (file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_SLASHES)) === false) return false;
  return rename($tmp, $p); // atomic on the same filesystem — never serve a half-written file
}
function nowIso() {
  $t = microtime(true); $ms = (int)round(($t - floor($t)) * 1000); if ($ms > 999) $ms = 999;
  return gmdate('Y-m-d\TH:i:s', (int)floor($t)) . sprintf('.%03dZ', $ms);
}
function logmsg($s) { fwrite(STDERR, $s . "\n"); if (PHP_SAPI !== 'cli') echo $s . "\n"; }

$prev      = readJSON($SNAP);
$updatedAt = nowIso();

// ---- 1) PRIMARY source: gold-api.com (keyless, per-symbol) ----
$price = []; $ok = true; $sourcesTried = ['gold-api']; $source = 'gold-api.com'; $attributions = [];
foreach ($METALS as $m => $sym) {
  $j = getJSON("https://api.gold-api.com/price/$sym");
  if ($j && isset($j['price']) && is_numeric($j['price']) && $j['price'] > 0) $price[$m] = (float)$j['price'];
  else { $ok = false; break; }
}

// ---- 2) FALLBACK source: metalpriceapi.com (only if a key is configured) ----
if (!$ok) {
  $cfg = is_file($CFG) ? include $CFG : null;
  $key = (is_array($cfg) && !empty($cfg['metalpriceapi_key'])) ? $cfg['metalpriceapi_key'] : '';
  if ($key) {
    $sourcesTried[] = 'metalpriceapi';
    $j = getJSON("https://api.metalpriceapi.com/v1/latest?api_key=$key&base=USD&currencies=XAU,XAG,XPT,XPD");
    $r = ($j && isset($j['rates'])) ? $j['rates'] : null;
    if ($r) {
      $inv = function ($x) { return ($x && is_numeric($x) && $x > 0) ? 1.0 / $x : null; }; // API returns oz per USD
      $p2 = ['gold' => $inv($r['XAU'] ?? null), 'silver' => $inv($r['XAG'] ?? null), 'platinum' => $inv($r['XPT'] ?? null), 'palladium' => $inv($r['XPD'] ?? null)];
      if (!in_array(null, $p2, true)) { $price = $p2; $ok = true; $source = 'metalpriceapi.com'; $attributions[] = 'Spot data via metalpriceapi.com'; }
    }
  }
}

// ---- 3) ALL sources failed: keep last good data, flag stale (redundancy) ----
if (!$ok) {
  if ($prev) {
    $prev['stale'] = true; $prev['lastCheckFailedAt'] = $updatedAt;
    writeJSONAtomic($SNAP, $prev);
    logmsg("all sources failed at $updatedAt — kept last good snapshot");
    exit(1);
  }
  logmsg("all sources failed at $updatedAt and no previous snapshot to keep");
  exit(1);
}

// ---- 4) day-change baseline ("open") — derived from the previous snapshot ----
$today    = gmdate('Y-m-d'); // UTC day
$prevDate = ($prev && !empty($prev['updatedAt'])) ? substr($prev['updatedAt'], 0, 10) : null;
$open = [];
foreach ($METALS as $m => $_) {
  if ($prev && isset($prev['metals'][$m])) {
    if ($prevDate === $today && isset($prev['metals'][$m]['open']) && is_numeric($prev['metals'][$m]['open'])) {
      $open[$m] = (float)$prev['metals'][$m]['open'];          // same UTC day → keep today's open
    } elseif (isset($prev['metals'][$m]['price']) && is_numeric($prev['metals'][$m]['price'])) {
      $open[$m] = (float)$prev['metals'][$m]['price'];         // new UTC day → previous close becomes the open
    } else { $open[$m] = $price[$m]; }
  } else { $open[$m] = $price[$m]; }                            // first ever run
}

// ---- 5) FX (non-fatal: reuse previous rates if the call fails) ----
$fx = ($prev && isset($prev['fx'])) ? $prev['fx'] : ['base' => 'USD', 'eur' => null, 'rates' => ['USD' => 1]];
$fj = getJSON('https://open.er-api.com/v6/latest/USD');
if ($fj && isset($fj['rates'])) {
  $rates = ['USD' => 1];
  foreach ($FX_CCY as $c) { if (isset($fj['rates'][$c]) && is_numeric($fj['rates'][$c])) $rates[$c] = (float)$fj['rates'][$c]; }
  $fx = ['base' => 'USD', 'eur' => ($rates['EUR'] ?? null), 'rates' => $rates];
}

// ---- 6) assemble + write prices.json (identical schema to the Node pipeline) ----
$metalsOut = [];
foreach ($METALS as $m => $_) {
  $o = $open[$m]; $p = $price[$m];
  $chg = ($o && $o > 0) ? round(($p - $o) / $o * 100, 2) : null;
  $metalsOut[$m] = ['price' => $p, 'open' => $o, 'changePct' => $chg];
}
$snap = [
  'updatedAt' => $updatedAt, 'delayedMinutes' => 10, 'base' => 'USD', 'unit' => 'troy_oz',
  'source' => $source, 'sourcesTried' => $sourcesTried, 'metals' => $metalsOut,
  'attributions' => $attributions, 'stale' => false, 'fx' => $fx,
];
writeJSONAtomic($SNAP, $snap);

// ---- 7) intraday rolling buffer (~26h, max 220 samples) — matches the live page ----
$intr = readJSON($INTRA);
if (!is_array($intr) || !isset($intr['metals']) || !is_array($intr['metals'])) $intr = ['metals' => []];
$cutoff = time() - 26 * 3600;
foreach ($METALS as $m => $_) {
  $arr = (isset($intr['metals'][$m]) && is_array($intr['metals'][$m])) ? $intr['metals'][$m] : [];
  $n = count($arr);
  if ($n === 0 || $arr[$n - 1][0] !== $updatedAt) $arr[] = [$updatedAt, $price[$m]];
  $arr = array_values(array_filter($arr, function ($pt) use ($cutoff) { return isset($pt[0]) && strtotime($pt[0]) >= $cutoff; }));
  if (count($arr) > 220) $arr = array_slice($arr, -220);
  $intr['metals'][$m] = $arr;
}
$intr['updatedAt'] = $updatedAt; $intr['stepMin'] = 10;
writeJSONAtomic($INTRA, $intr);

logmsg("ok  source=$source  $updatedAt  gold={$price['gold']} silver={$price['silver']} pt={$price['platinum']} pd={$price['palladium']}");
