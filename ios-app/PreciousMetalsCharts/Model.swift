//
//  Model.swift
//  Data models, design tokens (matching the website) and small helpers.
//

import SwiftUI

// MARK: - prices.json

struct Snapshot: Codable {
    let updatedAt: String?
    let delayedMinutes: Int?
    let source: String?
    let stale: Bool?
    let metals: [String: Metal]
    let fx: FX?
}

struct Metal: Codable {
    let price: Double?
    let open: Double?
    let changePct: Double?
}

struct FX: Codable {
    let base: String?
    let eur: Double?
    let rates: [String: Double]?
}

// MARK: - app-ad.json (server-controlled bottom slot — change advertisers without an app update)

struct AdSlot: Codable {
    let active: Bool?      // false => app shows the house newsletter promo
    let sponsored: Bool?   // true  => show the "ADVERTISEMENT" disclosure label
    let title: String?
    let subtitle: String?
    let url: String?
}

// MARK: - per-metal display info

enum MetalInfo {
    static let order = ["gold", "silver", "platinum", "palladium"]
    static let name: [String: String]   = ["gold": "Gold", "silver": "Silver", "platinum": "Platinum", "palladium": "Palladium"]
    static let symbol: [String: String] = ["gold": "Au", "silver": "Ag", "platinum": "Pt", "palladium": "Pd"]
    static let purity: [String: String] = ["gold": "24K · .999", "silver": ".999", "platinum": ".9995", "palladium": ".9995"]
}

// MARK: - ISO-8601 parsing (handles the ".923Z" fractional seconds)

enum ISO {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()
    static func parse(_ s: String?) -> Date? {
        guard let s = s else { return nil }
        return withFraction.date(from: s) ?? plain.date(from: s)
    }
}

// MARK: - color from hex + design tokens (light + dark, from the website)

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: h).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255.0
        let g = Double((int >> 8) & 0xFF) / 255.0
        let b = Double(int & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

struct Theme {
    let scheme: ColorScheme
    private var dark: Bool { scheme == .dark }

    var bg: Color       { dark ? Color(hex: "0D0E11") : Color(hex: "F4F4F1") }
    var surface: Color  { dark ? Color(hex: "16181D") : Color(hex: "FFFFFF") }
    var surface2: Color { dark ? Color(hex: "1B1E24") : Color(hex: "FAFAF8") }
    var ink: Color      { dark ? Color(hex: "ECEDEA") : Color(hex: "17191E") }
    var muted: Color    { dark ? Color(hex: "8A9099") : Color(hex: "6B7177") }
    var faint: Color    { dark ? Color(hex: "5E646C") : Color(hex: "9AA0A6") }
    var line: Color     { dark ? Color(hex: "24272E") : Color(hex: "E5E6E2") }
    var accent: Color   { dark ? Color(hex: "D4A24E") : Color(hex: "9A7322") }
    var up: Color       { dark ? Color(hex: "46B488") : Color(hex: "1A7F5A") }
    var down: Color     { dark ? Color(hex: "E0685C") : Color(hex: "C2453A") }

    func metal(_ key: String) -> Color {
        switch key {
        case "gold":      return dark ? Color(hex: "D4A93C") : Color(hex: "C19A2E")
        case "silver":    return dark ? Color(hex: "A6ADB4") : Color(hex: "8C9298")
        case "platinum":  return dark ? Color(hex: "AFC3CE") : Color(hex: "9FB1BB")
        case "palladium": return dark ? Color(hex: "CDAE8E") : Color(hex: "B8997A")
        default:          return accent
        }
    }
}
