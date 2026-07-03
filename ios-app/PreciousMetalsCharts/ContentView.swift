//
//  ContentView.swift
//  The screen: header, currency/unit controls, and one row per metal with a
//  per-row intraday sparkline. Mirrors live.preciousmetalscharts.com.
//
//  Paste this into the "ContentView.swift" file Xcode generated (replace its contents).
//

import SwiftUI

struct ContentView: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @StateObject private var vm = PricesViewModel()
    @AppStorage("themeMode") private var themeMode = "system"   // system | light | dark
    @State private var selection: MetalSelection?               // tapped metal → detail chart

    private var t: Theme { Theme(scheme: scheme) }
    private var resolvedScheme: ColorScheme? {
        themeMode == "light" ? .light : (themeMode == "dark" ? .dark : nil)
    }
    private var themeIcon: String {
        themeMode == "light" ? "sun.max.fill" : (themeMode == "dark" ? "moon.fill" : "circle.lefthalf.filled")
    }
    private func cycleTheme() {
        themeMode = themeMode == "system" ? "light" : (themeMode == "light" ? "dark" : "system")
    }

    var body: some View {
        ZStack {
            t.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                controls
                Rectangle().fill(t.line).frame(height: 1)
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(vm.order, id: \.self) { key in
                            if let m = vm.snapshot?.metals[key], let price = m.price {
                                Button { selection = MetalSelection(key: key) } label: {
                                    MetalRow(key: key, metal: m, price: price, vm: vm, t: t)
                                }
                                .buttonStyle(.plain)
                                Rectangle().fill(t.line).frame(height: 1).padding(.leading, 16)
                            }
                        }
                    }
                    .padding(.top, 2)
                }
                .refreshable { await vm.refresh() }
                Spacer(minLength: 0)
                AdSlotView(ad: vm.ad, t: t)
                legalLine
            }
        }
        .onAppear { vm.start() }
        .onDisappear { vm.stop() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { Task { await vm.refresh() } }
        }
        .preferredColorScheme(resolvedScheme)
        .sheet(item: $selection) { sel in
            MetalDetailView(key: sel.key, vm: vm, t: t)
        }
    }

    // MARK: header
    private var header: some View {
        HStack(spacing: 9) {
            Button {
                if let u = URL(string: "https://preciousmetalscharts.com") { openURL(u) }
            } label: {
                HStack(spacing: 9) {
                    LogoMark(t: t).frame(width: 30, height: 30)
                    (Text("preciousmetals").foregroundColor(t.ink)
                        + Text("charts").foregroundColor(t.accent))
                        .font(.system(size: 17, weight: .semibold))
                }
            }
            .buttonStyle(.plain)
            Spacer()
            Button(action: cycleTheme) {
                Image(systemName: themeIcon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(t.muted)
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Appearance: \(themeMode)")
            HStack(spacing: 5) {
                Circle().fill(t.up).frame(width: 7, height: 7)
                Text("LIVE")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .foregroundColor(t.accent)
            }
            .padding(.horizontal, 7).padding(.vertical, 3)
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(t.line, lineWidth: 1))
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
    }

    // MARK: currency + unit controls + status
    private var controls: some View {
        let fresh = vm.freshness()
        return VStack(spacing: 8) {
            HStack(spacing: 10) {
                Menu {
                    ForEach(vm.currencies, id: \.self) { c in
                        Button(c) { vm.currency = c }
                    }
                } label: { pill(title: "Currency", value: vm.currency) }

                Menu {
                    ForEach(PricesViewModel.Unit.allCases) { u in
                        Button(u.label) { vm.unit = u }
                    }
                } label: { pill(title: "Unit", value: vm.unit.label) }
            }
            HStack(spacing: 6) {
                Circle().fill(fresh.stale ? t.down : t.up).frame(width: 6, height: 6)
                Text(fresh.text)
                    .font(.system(size: 12))
                    .foregroundColor(fresh.stale ? t.down : t.muted)
                Spacer()
            }
        }
        .padding(.horizontal, 16).padding(.bottom, 10)
    }

    private func pill(title: String, value: String) -> some View {
        HStack(spacing: 8) {
            Text(title).font(.system(size: 12)).foregroundColor(t.muted)
            Spacer(minLength: 4)
            Text(value).font(.system(size: 14, weight: .semibold, design: .monospaced)).foregroundColor(t.ink)
            Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundColor(t.faint)
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .frame(maxWidth: .infinity)
        .background(t.surface)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(t.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: slim legal line (under the ad slot)
    private var legalLine: some View {
        Text("Independent · not a dealer · educational only, not investment advice")
            .font(.system(size: 10)).foregroundColor(t.faint)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(t.bg)
    }
}

// MARK: - bottom ad / sponsor slot (server-controlled via app-ad.json)

struct AdSlotView: View {
    let ad: AdSlot?
    let t: Theme
    @Environment(\.openURL) private var openURL

    // When no paid advertiser is active, show an inviting house newsletter promo
    // (a real, tappable element — cleaner for App Review than an empty placeholder).
    private var resolved: (house: Bool, sponsored: Bool, title: String, subtitle: String, url: String) {
        if let a = ad, a.active == true, let title = a.title, !title.isEmpty, let url = a.url, URL(string: url)?.scheme == "https" {
            return (false, a.sponsored ?? true, title, a.subtitle ?? "", url)
        }
        return (true, false,
                "The free metals newsletter",
                "A short, factual recap — daily, weekly or monthly.",
                "https://preciousmetalscharts.com/newsletter")
    }

    var body: some View {
        let r = resolved
        Button {
            if let u = URL(string: r.url) { openURL(u) }
        } label: {
            if r.house { housePromo(r) } else { advertiser(r) }
        }
        .buttonStyle(.plain)
    }

    // inviting newsletter promo: envelope icon + copy + "Subscribe" pill on accent-soft
    private func housePromo(_ r: (house: Bool, sponsored: Bool, title: String, subtitle: String, url: String)) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "envelope.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 38, height: 38)
                .background(t.accent)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(r.title).font(.system(size: 14, weight: .semibold)).foregroundColor(t.ink)
                if !r.subtitle.isEmpty {
                    Text(r.subtitle).font(.system(size: 12)).foregroundColor(t.muted)
                }
            }
            Spacer(minLength: 8)
            Text("Subscribe →")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 13).padding(.vertical, 7)
                .background(t.accent)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(t.accentSoft)
        .overlay(Rectangle().fill(t.line).frame(height: 1), alignment: .top)
    }

    // neutral paid advertiser card with an "ADVERTISEMENT" disclosure label
    private func advertiser(_ r: (house: Bool, sponsored: Bool, title: String, subtitle: String, url: String)) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if r.sponsored {
                Text("ADVERTISEMENT")
                    .font(.system(size: 9, weight: .semibold)).tracking(0.8)
                    .foregroundColor(t.faint)
            }
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.title).font(.system(size: 14, weight: .semibold)).foregroundColor(t.ink)
                    if !r.subtitle.isEmpty {
                        Text(r.subtitle).font(.system(size: 12)).foregroundColor(t.muted)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold)).foregroundColor(t.faint)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.surface2)
        .overlay(Rectangle().fill(t.line).frame(height: 1), alignment: .top)
    }
}

// MARK: - one metal row

struct MetalRow: View {
    let key: String
    let metal: Metal
    let price: Double
    @ObservedObject var vm: PricesViewModel
    let t: Theme

    private var chg: Double { metal.changePct ?? 0 }
    private var up: Bool { chg >= 0 }

    var body: some View {
        HStack(spacing: 12) {
            // element chip
            Text(MetalInfo.symbol[key] ?? "")
                .font(.system(size: 14, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
                .frame(width: 38, height: 38)
                .background(t.metal(key))
                .clipShape(RoundedRectangle(cornerRadius: 9))

            // name + purity
            VStack(alignment: .leading, spacing: 2) {
                Text(MetalInfo.name[key] ?? key.capitalized)
                    .font(.system(size: 15, weight: .semibold)).foregroundColor(t.ink)
                Text(MetalInfo.purity[key] ?? "")
                    .font(.system(size: 11, design: .monospaced)).foregroundColor(t.faint)
            }

            Spacer(minLength: 6)

            // sparkline
            Sparkline(data: vm.spark[key] ?? [], color: up ? t.up : t.down)
                .frame(width: 52, height: 30)
                .opacity((vm.spark[key]?.count ?? 0) >= 2 ? 1 : 0)

            // price + change
            VStack(alignment: .trailing, spacing: 2) {
                Text(vm.displayPrice(price))
                    .font(.system(size: 16, weight: .semibold, design: .monospaced))
                    .foregroundColor(t.ink)
                Text(vm.displayAbsChange(price: price, changePct: chg) + "  " + vm.pctString(chg))
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(up ? t.up : t.down)
            }

            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(t.faint)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }
}

// MARK: - sparkline (hand-drawn path over the intraday series)

struct Sparkline: View {
    let data: [Double]
    let color: Color

    var body: some View {
        GeometryReader { geo in
            if data.count >= 2 {
                let minV = data.min() ?? 0
                let maxV = data.max() ?? 1
                let range = (maxV - minV) == 0 ? 1 : (maxV - minV)
                Path { p in
                    for (i, v) in data.enumerated() {
                        let x = geo.size.width * CGFloat(i) / CGFloat(data.count - 1)
                        let y = geo.size.height * (1 - CGFloat((v - minV) / range))
                        if i == 0 { p.move(to: CGPoint(x: x, y: y)) }
                        else { p.addLine(to: CGPoint(x: x, y: y)) }
                    }
                }
                .stroke(color, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            }
        }
    }
}

// MARK: - brand logo mark (the gold chart, drawn to match the website)

struct LogoMark: View {
    let t: Theme
    var body: some View {
        Canvas { ctx, size in
            let s = size.width / 34.0
            func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            // rounded border
            let border = Path(roundedRect: CGRect(x: 1 * s, y: 1 * s, width: 32 * s, height: 32 * s), cornerRadius: 9 * s)
            ctx.stroke(border, with: .color(t.lineStrong), lineWidth: 1.4 * s)
            // baseline
            var base = Path(); base.move(to: P(8, 26.4)); base.addLine(to: P(26, 26.4))
            ctx.stroke(base, with: .color(t.faint), style: StrokeStyle(lineWidth: 1.4 * s, lineCap: .round))
            // chart line
            var line = Path()
            line.move(to: P(8, 22.5)); line.addLine(to: P(14, 16)); line.addLine(to: P(18.5, 19.5)); line.addLine(to: P(26, 10))
            ctx.stroke(line, with: .color(t.accent), style: StrokeStyle(lineWidth: 2.1 * s, lineCap: .round, lineJoin: .round))
            // node
            let node = Path(roundedRect: CGRect(x: 23.4 * s, y: 7.4 * s, width: 5.2 * s, height: 5.2 * s), cornerRadius: 1.3 * s)
            ctx.fill(node, with: .color(t.accent))
        }
    }
}

// MARK: - tap a metal → expanded chart (like the Live web app)

struct MetalSelection: Identifiable { let key: String; var id: String { key } }

private struct Rng: Identifiable { let label: String; let file: String; var id: String { file } }

struct MetalDetailView: View {
    let key: String
    @ObservedObject var vm: PricesViewModel
    let t: Theme
    @Environment(\.dismiss) private var dismiss

    @State private var range = "1y"
    @State private var values: [Double] = []
    @State private var dates: [String] = []
    @State private var loading = true

    private let ranges = [Rng(label: "1M", file: "1m"), Rng(label: "1Y", file: "1y"),
                          Rng(label: "5Y", file: "5y"), Rng(label: "Max", file: "50y")]

    private var metal: Metal? { vm.snapshot?.metals[key] }
    private var chg: Double { metal?.changePct ?? 0 }
    private var up: Bool { chg >= 0 }

    var body: some View {
        ZStack {
            t.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                priceLine
                rangeBar
                BigChart(values: values, dates: dates, color: up ? t.up : t.down, t: t, fmt: { vm.displayPrice($0) })
                    .frame(height: 244)
                    .padding(.horizontal, 16).padding(.top, 6)
                    .opacity(values.count > 1 ? 1 : 0)
                    .overlay { if loading && values.count < 2 { ProgressView().tint(t.muted) } }
                Spacer(minLength: 0)
                Text("Our own price archive · deep history via World Bank · prices ~10 min delayed")
                    .font(.system(size: 10)).foregroundColor(t.faint)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24).padding(.bottom, 16).padding(.top, 8)
            }
        }
        .task { await load() }
    }

    private var header: some View {
        HStack {
            HStack(spacing: 10) {
                Text(MetalInfo.symbol[key] ?? "")
                    .font(.system(size: 14, weight: .bold, design: .monospaced)).foregroundColor(.white)
                    .frame(width: 36, height: 36).background(t.metal(key)).clipShape(RoundedRectangle(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 2) {
                    Text(MetalInfo.name[key] ?? key.capitalized).font(.system(size: 16, weight: .semibold)).foregroundColor(t.ink)
                    Text(MetalInfo.purity[key] ?? "").font(.system(size: 11, design: .monospaced)).foregroundColor(t.faint)
                }
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)).foregroundColor(t.muted).frame(width: 32, height: 32)
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 8)
    }

    @ViewBuilder private var priceLine: some View {
        if let price = metal?.price {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(vm.displayPrice(price)).font(.system(size: 30, weight: .semibold, design: .monospaced)).foregroundColor(t.ink)
                Text(vm.displayAbsChange(price: price, changePct: chg) + "  " + vm.pctString(chg))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundColor(up ? t.up : t.down)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.bottom, 4)
        }
    }

    private var rangeBar: some View {
        HStack(spacing: 6) {
            ForEach(ranges) { r in
                Button {
                    range = r.file
                    Task { await load() }
                } label: {
                    Text(r.label)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                        .foregroundColor(range == r.file ? t.accent : t.muted)
                        .padding(.horizontal, 13).padding(.vertical, 6)
                        .background(range == r.file ? t.accentSoft : Color.clear)
                        .clipShape(Capsule())
                }.buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
    }

    private func load() async {
        loading = true
        guard var c = URLComponents(string: "https://preciousmetalscharts.com/history/\(key)-\(range).json") else { loading = false; return }
        c.queryItems = [URLQueryItem(name: "t", value: String(Int(Date().timeIntervalSince1970)))]
        guard let url = c.url else { loading = false; return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
               let pts = obj["points"] as? [[Any]] {
                var vs: [Double] = [], ds: [String] = []
                for p in pts {
                    guard p.count >= 2 else { continue }
                    let v = (p[1] as? NSNumber)?.doubleValue ?? (p[1] as? Double)
                    if let v = v { vs.append(v); ds.append((p[0] as? String) ?? "") }
                }
                values = vs; dates = ds
            }
        } catch { }
        loading = false
    }
}

// MARK: - the large interactive line chart

struct BigChart: View {
    let values: [Double]
    let dates: [String]
    let color: Color
    let t: Theme
    let fmt: (Double) -> String
    @State private var sel: Int? = nil

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let axis: CGFloat = 18           // bottom strip for date labels
            let plot = h - axis
            if values.count >= 2, let mn = values.min(), let mx = values.max() {
                let span = (mx - mn) == 0 ? 1 : (mx - mn)
                let xOf: (Int) -> CGFloat = { i in w * CGFloat(i) / CGFloat(values.count - 1) }
                let yOf: (Double) -> CGFloat = { v in (plot - 8) - CGFloat((v - mn) / span) * (plot - 16) + 4 }

                ZStack(alignment: .topLeading) {
                    ForEach(1..<4) { g in
                        let gy = plot * CGFloat(g) / 4
                        Path { p in p.move(to: CGPoint(x: 0, y: gy)); p.addLine(to: CGPoint(x: w, y: gy)) }
                            .stroke(t.line, lineWidth: 1)
                    }
                    Path { p in
                        p.move(to: CGPoint(x: xOf(0), y: yOf(values[0])))
                        for i in 1..<values.count { p.addLine(to: CGPoint(x: xOf(i), y: yOf(values[i]))) }
                        p.addLine(to: CGPoint(x: xOf(values.count - 1), y: plot)); p.addLine(to: CGPoint(x: xOf(0), y: plot)); p.closeSubpath()
                    }
                    .fill(LinearGradient(colors: [color.opacity(0.18), color.opacity(0)], startPoint: .top, endPoint: .bottom))
                    Path { p in
                        p.move(to: CGPoint(x: xOf(0), y: yOf(values[0])))
                        for i in 1..<values.count { p.addLine(to: CGPoint(x: xOf(i), y: yOf(values[i]))) }
                    }
                    .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))

                    if let s = sel, s >= 0, s < values.count {
                        Path { p in p.move(to: CGPoint(x: xOf(s), y: 0)); p.addLine(to: CGPoint(x: xOf(s), y: plot)) }
                            .stroke(t.lineStrong, lineWidth: 1)
                        Circle().fill(color).frame(width: 8, height: 8).position(x: xOf(s), y: yOf(values[s]))
                        Text("\(dates[s]) · \(fmt(values[s]))")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundColor(t.ink)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(t.surface).clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(t.line, lineWidth: 1))
                            .position(x: min(max(xOf(s), 72), w - 72), y: 12)
                    } else {
                        Text(fmt(mx)).font(.system(size: 10, design: .monospaced)).foregroundColor(t.faint)
                            .padding(.horizontal, 4).background(t.bg).position(x: 34, y: 10)
                        Text(fmt(mn)).font(.system(size: 10, design: .monospaced)).foregroundColor(t.faint)
                            .padding(.horizontal, 4).background(t.bg).position(x: 34, y: plot - 10)
                    }

                    Text(dates.first ?? "").font(.system(size: 10, design: .monospaced)).foregroundColor(t.faint)
                        .position(x: 34, y: h - 8)
                    Text(dates.last ?? "").font(.system(size: 10, design: .monospaced)).foregroundColor(t.faint)
                        .position(x: w - 38, y: h - 8)
                }
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        let i = Int((g.location.x / max(w, 1) * CGFloat(values.count - 1)).rounded())
                        sel = min(max(i, 0), values.count - 1)
                    }
                    .onEnded { _ in sel = nil })
            }
        }
    }
}
