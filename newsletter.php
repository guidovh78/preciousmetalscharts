<?php
/**
 * newsletter.php — subscribe / confirm / unsubscribe endpoint for the metals newsletter.
 * ---------------------------------------------------------------------------------------
 * - POST (JSON {email, frequency, metals[]}) → store as "pending" + email a double opt-in
 *   confirmation link via Brevo. Returns JSON {ok:true}.
 * - GET ?confirm=<token>  → activate the subscriber, show a confirmation page.
 * - GET ?u=<token>        → unsubscribe, show a goodbye page.
 *
 * Subscribers + config live in ./data (protected by .htaccess, never in the public repo).
 * Create ./data/newsletter-config.php yourself (see the README block at the bottom) — it
 * holds the Brevo API key + sender, so the secret stays off GitHub.
 * ---------------------------------------------------------------------------------------
 */

declare(strict_types=1);

const SITE       = 'https://preciousmetalscharts.com';
const ALLOWED_M  = ['gold', 'silver', 'platinum', 'palladium'];
const ALLOWED_F  = ['daily', 'weekly', 'monthly'];

$DATA_DIR = __DIR__ . '/data';
$STORE    = $DATA_DIR . '/subscribers.json';
$CONFIG   = $DATA_DIR . '/newsletter-config.php';

// ---- ensure the data dir exists + is protected ----------------------------------------
if (!is_dir($DATA_DIR)) { @mkdir($DATA_DIR, 0775, true); }
$ht = $DATA_DIR . '/.htaccess';
if (!file_exists($ht)) { @file_put_contents($ht, "Require all denied\nDeny from all\n"); }

function cfg(string $key, $default = null) {
    static $c = null;
    global $CONFIG;
    if ($c === null) { $c = file_exists($CONFIG) ? (include $CONFIG) : []; if (!is_array($c)) $c = []; }
    return $c[$key] ?? $default;
}

function jsonOut(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function loadSubs(string $store): array {
    if (!file_exists($store)) return [];
    $raw = file_get_contents($store);
    $d = json_decode($raw ?: '[]', true);
    return is_array($d) ? $d : [];
}

function saveSubs(string $store, array $subs): bool {
    $fp = fopen($store, 'c+');
    if (!$fp) return false;
    $ok = false;
    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0); rewind($fp);
        fwrite($fp, json_encode(array_values($subs), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        fflush($fp); flock($fp, LOCK_UN); $ok = true;
    }
    fclose($fp);
    return $ok;
}

function tok(): string { return bin2hex(random_bytes(16)); }
function nowISO(): string { return gmdate('c'); }

/** Send one transactional email via the Brevo API. Returns true on success. */
function brevoSend(string $toEmail, string $subject, string $html, string $text): bool {
    $key = cfg('brevo_key');
    if (!$key) return false;
    $payload = [
        'sender'      => ['name' => cfg('sender_name', 'preciousmetalscharts'), 'email' => cfg('sender_email', 'newsletter@preciousmetalscharts.com')],
        'to'          => [['email' => $toEmail]],
        'subject'     => $subject,
        'htmlContent' => $html,
        'textContent' => $text,
        'tags'        => ['newsletter-doi'],
    ];
    $ch = curl_init('https://api.brevo.com/v3/smtp/email');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['accept: application/json', 'content-type: application/json', 'api-key: ' . $key],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 15,
    ]);
    $res  = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $code >= 200 && $code < 300;
}

function confirmEmailHtml(string $confirmUrl, string $freq, array $metals): array {
    $metalNames = implode(', ', array_map('ucfirst', $metals));
    $freqLabel  = ucfirst($freq);
    $html = '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17191E;max-width:480px;margin:0 auto;">'
        . '<p style="font-size:15px;">Welcome to the <b>preciousmetals<span style="color:#9A7322;">charts</span></b> newsletter.</p>'
        . '<p style="font-size:14px;line-height:1.55;color:#3a3d42;">You asked for a <b>' . $freqLabel . '</b> recap of <b>' . htmlspecialchars($metalNames) . '</b>. Confirm your email to start:</p>'
        . '<p style="margin:22px 0;"><a href="' . htmlspecialchars($confirmUrl) . '" style="background:#9A7322;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;display:inline-block;">Confirm subscription</a></p>'
        . '<p style="font-size:12.5px;color:#6B7177;line-height:1.5;">If the button does not work, paste this link into your browser:<br><span style="color:#9A7322;">' . htmlspecialchars($confirmUrl) . '</span></p>'
        . '<p style="font-size:11.5px;color:#9AA0A6;line-height:1.5;margin-top:18px;">You received this because someone entered this address at preciousmetalscharts.com/newsletter. If that was not you, simply ignore this email — no newsletter will be sent without confirmation. Independent, not a dealer. Educational information only, not investment advice.</p>'
        . '</div>';
    $text = "Confirm your preciousmetalscharts newsletter ($freqLabel · $metalNames):\n$confirmUrl\n\nIf you did not request this, ignore this email — nothing will be sent without confirmation.";
    return [$html, $text];
}

function page(string $title, string $bodyHtml): void {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex"><title>' . htmlspecialchars($title) . ' — preciousmetalscharts</title>'
        . '<style>body{margin:0;background:#F4F4F1;color:#17191E;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px;}'
        . '.card{background:#fff;border:1px solid #E5E6E2;border-radius:14px;padding:28px 30px;max-width:440px;text-align:center;}'
        . 'h1{font-size:20px;margin:0 0 8px;}p{font-size:14px;line-height:1.6;color:#3a3d42;}a.btn{display:inline-block;margin-top:14px;background:#9A7322;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px;}</style></head>'
        . '<body><div class="card">' . $bodyHtml . '</div></body></html>';
    exit;
}

// ---- GET: confirm / unsubscribe -------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $confirm = $_GET['confirm'] ?? '';
    $unsub   = $_GET['u'] ?? '';
    if ($confirm === '' && $unsub === '') { header('Location: ' . SITE . '/newsletter'); exit; }

    $subs = loadSubs($STORE); $changed = false; $matched = null;
    foreach ($subs as &$s) {
        if ($confirm !== '' && hash_equals((string)($s['confirmToken'] ?? ''), $confirm)) {
            if (($s['status'] ?? '') !== 'active') { $s['status'] = 'active'; $s['confirmedAt'] = nowISO(); }
            $matched = $s; $changed = true; break;
        }
        if ($unsub !== '' && hash_equals((string)($s['unsubToken'] ?? ''), $unsub)) {
            $s['status'] = 'unsubscribed'; $matched = $s; $changed = true; break;
        }
    }
    unset($s);
    if ($changed) saveSubs($STORE, $subs);

    if ($confirm !== '') {
        if ($matched) page('Subscription confirmed', '<h1>You\'re in ✓</h1><p>Your ' . htmlspecialchars(ucfirst($matched['frequency'] ?? '')) . ' metals recap is on its way at the next edition. You can change or cancel from any email.</p><a class="btn" href="' . SITE . '/">Back to the charts</a>');
        page('Link expired', '<h1>Hmm, that link didn\'t match</h1><p>It may have already been used or expired. Try subscribing again.</p><a class="btn" href="' . SITE . '/newsletter">Subscribe</a>');
    } else {
        page('Unsubscribed', '<h1>You\'re unsubscribed</h1><p>You won\'t receive any more newsletters. No hard feelings — you can resubscribe anytime.</p><a class="btn" href="' . SITE . '/">Back to the charts</a>');
    }
}

// ---- POST: subscribe ------------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { jsonOut(['ok' => false, 'error' => 'Method not allowed'], 405); }

$raw = file_get_contents('php://input');
$in  = json_decode($raw ?: '', true);
if (!is_array($in)) $in = $_POST;

$email = strtolower(trim((string)($in['email'] ?? '')));
$freq  = strtolower(trim((string)($in['frequency'] ?? 'weekly')));
$metalsIn = is_array($in['metals'] ?? null) ? $in['metals'] : [];
$metalsClean = [];
foreach ($metalsIn as $m) { $metalsClean[] = strtolower(trim((string) $m)); }
$metals = array_values(array_intersect(ALLOWED_M, $metalsClean));

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) jsonOut(['ok' => false, 'error' => 'Please enter a valid email address.'], 422);
if (!in_array($freq, ALLOWED_F, true)) $freq = 'weekly';
if (!$metals) jsonOut(['ok' => false, 'error' => 'Pick at least one metal.'], 422);
if (!cfg('brevo_key')) jsonOut(['ok' => false, 'error' => 'The newsletter is not configured yet. Please try again later.'], 503);

$subs = loadSubs($STORE);
$existing = null;
foreach ($subs as $i => $s) { if (strtolower((string)($s['email'] ?? '')) === $email) { $existing = $i; break; } }

if ($existing !== null) {
    $s = $subs[$existing];
    $s['frequency'] = $freq;
    $s['metals']    = $metals;
    if (($s['status'] ?? '') === 'active') {
        // already confirmed — just update preferences, no new confirm email needed
        $subs[$existing] = $s;
        saveSubs($STORE, $subs);
        jsonOut(['ok' => true, 'already' => true]);
    }
    // pending or previously unsubscribed → re-confirm
    $s['status'] = 'pending';
    if (empty($s['confirmToken'])) $s['confirmToken'] = tok();
    if (empty($s['unsubToken']))   $s['unsubToken']   = tok();
    $subs[$existing] = $s;
} else {
    $s = [
        'email'        => $email,
        'frequency'    => $freq,
        'metals'       => $metals,
        'status'       => 'pending',
        'confirmToken' => tok(),
        'unsubToken'   => tok(),
        'createdAt'    => nowISO(),
        'confirmedAt'  => null,
        'lastSent'     => new stdClass(),
    ];
    $subs[] = $s;
}

if (!saveSubs($STORE, $subs)) jsonOut(['ok' => false, 'error' => 'Could not save. Please try again.'], 500);

$confirmUrl = SITE . '/newsletter.php?confirm=' . $s['confirmToken'];
[$html, $text] = confirmEmailHtml($confirmUrl, $freq, $metals);
$sent = brevoSend($email, 'Confirm your metals newsletter', $html, $text);

if (!$sent) jsonOut(['ok' => false, 'error' => 'We could not send the confirmation email. Please try again.'], 502);
jsonOut(['ok' => true]);

/*
=========================================================================================
 SETUP — create  data/newsletter-config.php  on the server (NOT in the public repo):

   <?php
   return [
     'brevo_key'    => 'xkeysib-XXXXXXXXXXXXXXXX',          // Brevo > SMTP & API > API Keys
     'sender_email' => 'newsletter@preciousmetalscharts.com', // a Brevo-verified sender
     'sender_name'  => 'preciousmetalscharts',
   ];

 The data/ folder is auto-created and protected (.htaccess deny). subscribers.json is
 written automatically. Authenticate the sending domain in Brevo (SPF/DKIM/DMARC DNS) for
 good inbox placement.
=========================================================================================
*/
