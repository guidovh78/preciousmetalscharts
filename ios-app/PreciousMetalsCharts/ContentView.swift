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
    @StateObject private var vm = PricesViewModel()

    private var t: Theme { Theme(scheme: scheme) }

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
                                MetalRow(key: key, metal: m, price: price, vm: vm, t: t)
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
    }

    // MARK: header
    private var header: some View {
        HStack(spacing: 8) {
            (Text("preciousmetals").foregroundColor(t.ink)
                + Text("charts").foregroundColor(t.accent))
                .font(.system(size: 17, weight: .semibold))
            Spacer()
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

    // When no paid advertiser is active, show the house newsletter promo —
    // a real, tappable element (cleaner for App Review than an empty placeholder).
    private var resolved: (sponsored: Bool, title: String, subtitle: String, url: String) {
        if let a = ad, a.active == true, let title = a.title, !title.isEmpty, let url = a.url, !url.isEmpty {
            return (a.sponsored ?? true, title, a.subtitle ?? "", url)
        }
        return (false,
                "The metals market, summarised",
                "Get the free newsletter — daily, weekly or monthly.",
                "https://preciousmetalscharts.com/newsletter")
    }

    var body: some View {
        let r = resolved
        Button {
            if let u = URL(string: r.url) { openURL(u) }
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                if r.sponsored {
                    Text("ADVERTISEMENT")
                        .font(.system(size: 9, weight: .semibold)).tracking(0.8)
                        .foregroundColor(t.faint)
                }
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.title)
                            .font(.system(size: 14, weight: .semibold)).foregroundColor(t.ink)
                        if !r.subtitle.isEmpty {
                            Text(r.subtitle)
                                .font(.system(size: 12)).foregroundColor(t.muted)
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
        .buttonStyle(.plain)
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
                .frame(width: 64, height: 30)
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
