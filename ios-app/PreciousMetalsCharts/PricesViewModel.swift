//
//  PricesViewModel.swift
//  Fetches the live feed, holds state, and does the same price/unit/currency math
//  as the Live web app.
//

import SwiftUI

@MainActor
final class PricesViewModel: ObservableObject {

    @Published var snapshot: Snapshot?
    @Published var spark: [String: [Double]] = [:]   // metal -> intraday price series
    @Published var currency: String = "USD"
    @Published var unit: Unit = .ounce
    @Published var loadFailed = false

    let order = MetalInfo.order
    private let base = URL(string: "https://preciousmetalscharts.com")!
    private var timer: Timer?

    // MARK: units (troy ounce is the base in the feed)
    enum Unit: String, CaseIterable, Identifiable {
        case ounce, gram, kilo
        var id: String { rawValue }
        var label: String { self == .ounce ? "oz" : (self == .gram ? "g" : "kg") }
        var factor: Double {
            switch self {
            case .ounce: return 1.0
            case .gram:  return 1.0 / 31.1034768
            case .kilo:  return 1000.0 / 31.1034768
            }
        }
    }

    var rate: Double { snapshot?.fx?.rates?[currency] ?? 1.0 }

    var currencies: [String] {
        let available = Set(snapshot?.fx?.rates?.keys.map { $0 } ?? ["USD"])
        let preferred = ["USD", "EUR", "GBP", "JPY", "CNY", "AUD", "CAD", "CHF", "HKD", "SGD"]
        let ordered = preferred.filter { available.contains($0) }
        return ordered.isEmpty ? ["USD"] : ordered
    }

    // MARK: lifecycle
    func start() {
        Task { await refresh() }
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { await self?.refresh() }
        }
    }
    func stop() { timer?.invalidate(); timer = nil }

    func refresh() async {
        await loadPrices()
        await loadIntraday()
    }

    // MARK: networking
    private func busted(_ path: String) -> URL {
        var c = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "t", value: String(Int(Date().timeIntervalSince1970)))]
        return c.url!
    }

    private func loadPrices() async {
        do {
            let (data, _) = try await URLSession.shared.data(from: busted("prices.json"))
            let snap = try JSONDecoder().decode(Snapshot.self, from: data)
            snapshot = snap
            if snap.fx?.rates?[currency] == nil { currency = "USD" }
            loadFailed = false
        } catch {
            loadFailed = true
        }
    }

    private func loadIntraday() async {
        do {
            let (data, _) = try await URLSession.shared.data(from: busted("intraday.json"))
            guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let metals = obj["metals"] as? [String: Any] else { return }
            var out: [String: [Double]] = [:]
            for (key, value) in metals {
                guard let points = value as? [[Any]] else { continue }
                out[key] = points.compactMap { pt -> Double? in
                    guard pt.count >= 2 else { return nil }
                    if let n = pt[1] as? NSNumber { return n.doubleValue }
                    if let d = pt[1] as? Double { return d }
                    return nil
                }
            }
            spark = out
        } catch {
            // sparklines are optional; ignore failures
        }
    }

    // MARK: display math (mirrors the web app)
    func displayPrice(_ usdPerOunce: Double) -> String {
        format(usdPerOunce * unit.factor * rate)
    }

    /// Absolute day change in the displayed currency + unit.
    func displayAbsChange(price usdPerOunce: Double, changePct: Double) -> String {
        let open = usdPerOunce / (1.0 + changePct / 100.0)
        let absUsd = usdPerOunce - open
        let v = absUsd * unit.factor * rate
        return (v >= 0 ? "+" : "−") + format(abs(v))
    }

    func pctString(_ p: Double) -> String {
        (p >= 0 ? "+" : "−") + String(format: "%.2f", abs(p)) + "%"
    }

    private func format(_ v: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = currency
        f.maximumFractionDigits = currency == "JPY" ? 0 : 2
        f.minimumFractionDigits = currency == "JPY" ? 0 : 2
        return f.string(from: NSNumber(value: v)) ?? String(format: "%.2f", v)
    }

    // MARK: freshness line (honest about staleness, like the website)
    func freshness() -> (text: String, stale: Bool) {
        guard let d = ISO.parse(snapshot?.updatedAt) else { return ("—", false) }
        let df = DateFormatter(); df.dateFormat = "HH:mm"
        let hhmm = df.string(from: d)
        let ageMin = Date().timeIntervalSince(d) / 60.0
        if loadFailed { return ("refresh failed — pull to retry", true) }
        if ageMin > 20 {
            let m = Int(ageMin.rounded())
            let ago = m >= 60 ? "\(m / 60)h \(m % 60)m" : "\(m) min"
            return ("as of \(hhmm) · updated \(ago) ago", true)
        }
        return ("as of \(hhmm) · ~\(snapshot?.delayedMinutes ?? 10) min delayed", false)
    }
}
