import SwiftUI
import KaskadeCore

// MARK: Mini board (static illustration)

/// Renders a small static position from a layout (`.` `*` `S` `M` `N`).
struct MiniBoard: View {
    let layout: [String]
    var highlight: Set<Cell> = []
    let palette: SkinPalette

    var body: some View {
        let state = Puzzle(id: "mini", title: "", goal: "", hint: "", layout: layout, toMove: .sun,
                           energySun: 0, energyMoon: 0, abilitiesEnabled: true, turns: 1).makeState()
        let g = state.geometry
        GeometryReader { geo in
            let cell = min(geo.size.width / CGFloat(g.columns), geo.size.height / CGFloat(g.rows))
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: cell * 0.3, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: 0x24306A), Color(hex: 0x0C1230)], startPoint: .top, endPoint: .bottom))
                ForEach(0..<g.columns, id: \.self) { c in
                    ForEach(0..<g.rows, id: \.self) { r in
                        let cellPos = Cell(c, r)
                        Group {
                            if let owner = state.owner(at: cellPos) {
                                StoneView(owner: owner, palette: palette, diameter: cell * 0.82, highlighted: highlight.contains(cellPos))
                            } else if state.hasCrystal(at: cellPos) {
                                CrystalGlyph(size: cell * 0.62)
                            } else {
                                Circle().fill(Color.black.opacity(0.35)).frame(width: cell * 0.75, height: cell * 0.75)
                            }
                        }
                        .position(x: (CGFloat(c) + 0.5) * cell, y: (CGFloat(g.rows - 1 - r) + 0.5) * cell)
                    }
                }
            }
            .frame(width: cell * CGFloat(g.columns), height: cell * CGFloat(g.rows))
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
        .aspectRatio(CGFloat(g.columns) / CGFloat(g.rows), contentMode: .fit)
        .accessibilityHidden(true)
    }
}

// MARK: Rules

struct RulesView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(spacing: 18) {
            ScreenHeader(title: "Regeln") { app.closeRules() }
            ScrollView {
                VStack(spacing: 18) {
                    ruleCard(title: "Ziel", text: "Bilde als Erster eine Reihe aus vier eigenen Steinen: waagerecht, senkrecht oder diagonal. Steine fallen immer auf den tiefsten freien Platz. Die Sonne beginnt, danach wird abwechselnd gezogen.") {
                        MiniBoard(layout: [".......", ".......", "...S...", "..SM...", ".SMM...", "SMMS..."],
                                  highlight: [Cell(0, 0), Cell(1, 1), Cell(2, 2), Cell(3, 3)], palette: app.palette)
                    }
                    ruleCard(title: "Kristalle und Energie", text: "Wer ein Kristallfeld zuerst mit einem eigenen Stein besetzt, erhält 1 Energie (höchstens 3). Der Mond startet mit 1 Energie und gleicht damit den Anzugsvorteil der Sonne aus. Ein neutraler Stein zerstört einen Kristall.") {
                        MiniBoard(layout: [".......", ".......", "....*..", "..*....", "..M.S..", "..SMM.."], palette: app.palette)
                    }
                    abilityCard(.anchor, text: "Wirf einen neutralen Stein, der niemandem gehört. Danach wirfst du sofort einen normalen Stein. So überbrückst du Lücken und verschiebst, wer in ein Drohfeld spielen muss.",
                                before: [".....", ".....", ".SSS.", ".MMM."], after: [".....", ".....", ".SSSS", ".MMMN"])
                    abilityCard(.geyser, text: "Schiebe einen eigenen Stein von unten in eine Spalte. Alle Steine darin steigen eine Reihe auf. Der Geysir ist dein ganzer Zug. Vorsicht: Entsteht dabei nur eine Reihe des Gegners, gewinnt er.",
                                before: [".....", "..M..", "..S..", "..M.."], after: ["..M..", "..S..", "..M..", "..S.."])
                    abilityCard(.rift, text: "Entferne den obersten Stein einer beliebigen Spalte und wirf danach sofort einen normalen Stein. Steht dein Gegner auf 3 Energie, reicht ein einzelner Block nicht mehr.",
                                before: [".....", ".....", "MMM..", "SSSM."], after: [".....", ".....", "MMM..", "SSSS."])
                    ruleCard(title: "Sieg, Remis, Sonderfälle", text: "• Erzeugt ein Geysir Reihen für beide Seiten, gewinnt, wer gezogen hat.\n• Pro Zug ist höchstens eine Fähigkeit erlaubt.\n• Kann der Spieler am Zug nicht mehr ziehen (Brett voll, kein Spalt möglich), endet die Partie remis.\n• In der Arena „Klassik“ gelten die reinen Grundregeln ohne Kristalle.") { EmptyView() }
                    ruleCard(title: "Taktik-Tipps", text: "• Die Mitte zählt: Durch sie laufen die meisten möglichen Reihen.\n• Zwei Drohungen auf einmal kann der Gegner nicht beide blocken.\n• Behalte die Energie des Gegners im Blick. Bei 2 droht ein Geysir, bei 3 ein Spalt.\n• Ein überbauter Block ist vor dem Spalt sicher.") { EmptyView() }
                    Button("Interaktives Tutorial starten") {
                        app.startTutorial()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.top, 6)
                }
                .frame(maxWidth: 900)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 18)
    }

    private func ruleCard<Illustration: View>(title: String, text: String, @ViewBuilder illustration: () -> Illustration) -> some View {
        HStack(alignment: .top, spacing: 22) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title).font(Theme.heading(22)).foregroundStyle(Theme.textPrimary)
                Text(text).font(Theme.body(17)).foregroundStyle(Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            illustration().frame(maxWidth: 220, maxHeight: 190)
        }
        .padding(22)
        .glassPanel(cornerRadius: 24)
    }

    private func abilityCard(_ ability: Ability, text: String, before: [String], after: [String]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                AbilityIcon(ability: ability, size: 30, color: Theme.crystal)
                Text(ability.displayName).font(Theme.heading(22)).foregroundStyle(Theme.textPrimary)
                CostPips(cost: ability.cost)
                Text("\(ability.cost) Energie").font(Theme.label(13)).foregroundStyle(Theme.textMuted)
                Spacer()
            }
            Text(text).font(Theme.body(17)).foregroundStyle(Theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 16) {
                MiniBoard(layout: before, palette: app.palette).frame(maxHeight: 150)
                Image(systemName: "arrow.right").font(.system(size: 26, weight: .bold)).foregroundStyle(Theme.textMuted)
                MiniBoard(layout: after, palette: app.palette).frame(maxHeight: 150)
            }
            .frame(maxWidth: 520)
        }
        .padding(22)
        .glassPanel(cornerRadius: 24)
    }
}

// MARK: Puzzles

struct PuzzleListView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(spacing: 18) {
            ScreenHeader(title: "Rätsel") { app.show(.menu) }
            Text("Jede Stellung ist von der KI geprüft: Es gibt einen erzwungenen Sieg, und die Verteidigung spielt perfekt.")
                .font(Theme.body(17)).foregroundStyle(Theme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 16)], spacing: 16) {
                    ForEach(Puzzle.catalog) { puzzle in
                        let solved = app.profile.solvedPuzzles.contains(puzzle.id)
                        Button {
                            app.sound.play(.tap)
                            app.startPuzzle(puzzle)
                        } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                MiniBoard(layout: puzzle.layout, palette: app.palette)
                                    .frame(height: 150)
                                HStack {
                                    Text(puzzle.title).font(Theme.heading(19)).foregroundStyle(Theme.textPrimary)
                                    Spacer()
                                    if solved {
                                        Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.success)
                                            .accessibilityLabel("gelöst")
                                    }
                                }
                                Text(puzzle.goal).font(Theme.body(14)).foregroundStyle(Theme.textSecondary)
                                if puzzle.abilitiesEnabled {
                                    HStack(spacing: 6) {
                                        Image(systemName: "bolt.fill").foregroundStyle(Theme.energy)
                                        Text("\(puzzle.energySun) Energie").font(Theme.label(12)).foregroundStyle(Theme.textMuted)
                                    }
                                }
                            }
                            .padding(16)
                            .glassPanel(cornerRadius: 22, highlighted: solved ? Theme.success.opacity(0.5) : nil)
                        }
                        .buttonStyle(PressScaleStyle())
                        .accessibilityIdentifier("puzzle-\(puzzle.id)")
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 18)
    }
}

// MARK: Statistics

struct StatsView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let profile = app.profile
        let stats = profile.stats
        VStack(spacing: 18) {
            ScreenHeader(title: "Statistik") { app.show(.menu) }
            ScrollView {
                VStack(spacing: 18) {
                    HStack(spacing: 16) {
                        statTile("Level", "\(profile.level)", detail: "\(profile.xp) XP gesamt")
                        statTile("Partien", "\(stats.gamesPlayed)", detail: "\(stats.totalTurns) eigene Züge")
                        statTile("Beste Serie", "\(stats.bestStreak)", detail: "aktuell \(stats.currentStreak)")
                        statTile("Kristalle", "\(stats.crystalsCollected)", detail: "gesammelt")
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        SectionTitle(text: "Gegen die KI")
                        ForEach(Difficulty.allCases) { d in
                            let r = stats.record(for: d)
                            HStack(spacing: 14) {
                                Text(d.displayName).font(Theme.heading(17)).foregroundStyle(Theme.textPrimary)
                                    .frame(width: 130, alignment: .leading)
                                RecordBar(record: r)
                                Text("\(r.wins) / \(r.losses) / \(r.draws)")
                                    .font(Theme.label(14)).foregroundStyle(Theme.textSecondary)
                                    .frame(width: 90, alignment: .trailing)
                            }
                            .accessibilityElement(children: .combine)
                        }
                        Text("Siege / Niederlagen / Remis").font(Theme.label(12)).foregroundStyle(Theme.textMuted)
                    }
                    .padding(22)
                    .glassPanel(cornerRadius: 24)
                    HStack(alignment: .top, spacing: 16) {
                        VStack(alignment: .leading, spacing: 10) {
                            SectionTitle(text: "Duelle")
                            Text("\(stats.duelsPlayed) gespielt").font(Theme.heading(20)).foregroundStyle(Theme.textPrimary)
                            Text("Sonne \(stats.duelWinsSun) · Mond \(stats.duelWinsMoon) · Remis \(stats.duelDraws)")
                                .font(Theme.body(15)).foregroundStyle(Theme.textSecondary)
                        }
                        .padding(22).frame(maxWidth: .infinity, alignment: .leading).glassPanel(cornerRadius: 24)
                        VStack(alignment: .leading, spacing: 10) {
                            SectionTitle(text: "Fähigkeiten")
                            ForEach(Ability.allCases, id: \.self) { a in
                                HStack {
                                    AbilityIcon(ability: a, size: 20, color: Theme.crystal)
                                    Text(a.displayName).font(Theme.body(16)).foregroundStyle(Theme.textPrimary)
                                    Spacer()
                                    Text("\(stats.abilitiesUsed[a.rawValue] ?? 0)×").font(Theme.heading(16)).foregroundStyle(Theme.textSecondary)
                                }
                            }
                        }
                        .padding(22).frame(maxWidth: .infinity, alignment: .leading).glassPanel(cornerRadius: 24)
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        SectionTitle(text: "Erfolge · \(profile.achievements.count)/\(Achievement.allCases.count)")
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 250), spacing: 12)], spacing: 12) {
                            ForEach(Achievement.allCases) { a in
                                let has = profile.has(a)
                                HStack(spacing: 12) {
                                    Image(systemName: has ? "rosette" : "lock.fill")
                                        .font(.system(size: 22, weight: .bold))
                                        .foregroundStyle(has ? Theme.energy : Theme.textMuted)
                                        .frame(width: 30)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(a.title).font(Theme.heading(16)).foregroundStyle(has ? Theme.textPrimary : Theme.textSecondary)
                                        Text(a.detail).font(Theme.body(13)).foregroundStyle(Theme.textMuted)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(14)
                                .background(RoundedRectangle(cornerRadius: 16).fill(Color.white.opacity(has ? 0.08 : 0.03)))
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                    .padding(22)
                    .glassPanel(cornerRadius: 24)
                }
                .frame(maxWidth: 1000)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 18)
    }

    private func statTile(_ title: String, _ value: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased()).font(Theme.label(12)).tracking(1.5).foregroundStyle(Theme.textMuted)
            Text(value).font(Theme.title(38)).foregroundStyle(Theme.textPrimary)
            Text(detail).font(Theme.label(13)).foregroundStyle(Theme.textSecondary)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassPanel(cornerRadius: 22)
        .accessibilityElement(children: .combine)
    }
}

private struct RecordBar: View {
    let record: RecordCount

    var body: some View {
        GeometryReader { g in
            let total = max(1, record.total)
            HStack(spacing: 2) {
                Rectangle().fill(Theme.success).frame(width: g.size.width * CGFloat(record.wins) / CGFloat(total))
                Rectangle().fill(Theme.danger).frame(width: g.size.width * CGFloat(record.losses) / CGFloat(total))
                Rectangle().fill(Theme.textMuted).frame(width: g.size.width * CGFloat(record.draws) / CGFloat(total))
            }
            .frame(width: g.size.width, alignment: .leading)
            .background(Color.white.opacity(0.08))
            .clipShape(Capsule())
        }
        .frame(height: 12)
    }
}

// MARK: Settings

struct SettingsView: View {
    @Environment(AppModel.self) private var app
    @State private var confirmReset = false

    var body: some View {
        @Bindable var app = app
        VStack(spacing: 18) {
            ScreenHeader(title: "Einstellungen") { app.show(.menu) }
            ScrollView {
                VStack(spacing: 18) {
                    group("Ton und Gefühl") {
                        toggle("Soundeffekte", isOn: $app.settings.soundEnabled, id: "toggleSound")
                        toggle("Musik", isOn: $app.settings.musicEnabled, id: "toggleMusic")
                        toggle("Haptisches Feedback", isOn: $app.settings.hapticsEnabled, id: "toggleHaptics")
                    }
                    group("Spiel") {
                        toggle("Landefeld-Vorschau anzeigen", isOn: $app.settings.showColumnHints, id: "toggleHints")
                        toggle("Reduzierte Bewegung", isOn: $app.settings.reduceMotion, id: "toggleMotion")
                        toggle("Tischmodus im Duell (Hochformat)", isOn: $app.settings.tableMode, id: "toggleTable")
                    }
                    group("Namen im Duell") {
                        nameField("Sonne", text: $app.settings.sunName)
                        nameField("Mond", text: $app.settings.moonName)
                    }
                    group("Steindesign") {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 12)], spacing: 12) {
                            ForEach(StoneSkin.catalog) { skin in
                                skinButton(skin)
                            }
                        }
                    }
                    group("Daten") {
                        Button(role: .destructive) {
                            confirmReset = true
                        } label: {
                            Text("Fortschritt zurücksetzen").font(Theme.heading(17)).foregroundStyle(Theme.danger)
                                .frame(maxWidth: .infinity, minHeight: 52)
                        }
                        Text("KASKADE speichert alles lokal auf diesem iPad. Keine Konten, keine Werbung, keine Datenübertragung.")
                            .font(Theme.body(14)).foregroundStyle(Theme.textMuted)
                    }
                }
                .frame(maxWidth: 760)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 18)
        .alert("Fortschritt zurücksetzen?", isPresented: $confirmReset) {
            Button("Zurücksetzen", role: .destructive) { app.resetProgress() }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Level, Statistik, Erfolge, Einstellungen und die gespeicherte Partie werden gelöscht.")
        }
    }

    private func group<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(text: title)
            content()
        }
        .padding(22)
        .glassPanel(cornerRadius: 24)
    }

    private func toggle(_ title: String, isOn: Binding<Bool>, id: String) -> some View {
        Toggle(isOn: isOn) {
            Text(title).font(Theme.body(17)).foregroundStyle(Theme.textPrimary)
        }
        .frame(minHeight: 48)
        .accessibilityIdentifier(id)
    }

    private func nameField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: Binding(get: { text.wrappedValue }, set: { text.wrappedValue = String($0.prefix(16)) }))
            .font(Theme.body(17))
            .foregroundStyle(Theme.textPrimary)
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .background(RoundedRectangle(cornerRadius: 14).fill(Color.white.opacity(0.06)))
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
    }

    private func skinButton(_ skin: StoneSkin) -> some View {
        let unlocked = app.profile.isUnlocked(skin)
        let selected = app.settings.skinID == skin.id
        let palette = SkinPalette.forSkin(skin.id)
        return Button {
            guard unlocked else { app.sound.play(.invalid); return }
            app.sound.play(.tap)
            app.settings.skinID = skin.id
        } label: {
            VStack(spacing: 10) {
                HStack(spacing: -8) {
                    StoneView(owner: .sun, palette: palette, diameter: 42)
                    StoneView(owner: .moon, palette: palette, diameter: 42)
                }
                .opacity(unlocked ? 1 : 0.35)
                Text(skin.name).font(Theme.label(14)).foregroundStyle(Theme.textPrimary)
                Text(unlocked ? (selected ? "Aktiv" : "Verfügbar") : "Ab Level \(skin.unlockLevel)")
                    .font(Theme.label(12)).foregroundStyle(selected ? Theme.crystal : Theme.textMuted)
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 18).fill(Color.white.opacity(selected ? 0.1 : 0.04)))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(selected ? Theme.crystal : .clear, lineWidth: 2))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(unlocked ? skin.name : "\(skin.name), gesperrt bis Level \(skin.unlockLevel)")
    }
}
