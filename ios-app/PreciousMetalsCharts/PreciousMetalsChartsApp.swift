//
//  PreciousMetalsChartsApp.swift
//  Precious Metals Charts — native iOS app (live spot prices)
//
//  Reads the SAME feed as live.preciousmetalscharts.com:
//    https://preciousmetalscharts.com/prices.json   (live spot + day change + FX)
//    https://preciousmetalscharts.com/intraday.json (rolling ~26h for the sparklines)
//  No account, no API key, no personal data collected.
//
//  Paste this into the "<Name>App.swift" file Xcode generated (replace its contents).
//

import SwiftUI

@main
struct PreciousMetalsChartsApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
