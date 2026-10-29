import SwiftUI
import KaskadeCore

/// Mode, opponent, side and arena selection.
struct NewGameView: View {
    @Environment(AppModel.self) private var app
    @State private var mode: GameMode = .versusAI
    @State private var difficulty: Difficulty = .strategist
    @State private var humanPlaysSun = true
    @State private var arenaID = Arena.origin.id
    @State private var trainingWithAI = false
    @State private var loaded = false

    var body: some View {
        VStack(spacing: 18) {
            ScreenHeader(title: "Neues Spiel") { app.show(.menu) }
            ScrollView {
                VStack(spacing: 26) {
                    modeSection
                    if mode == .versusAI || (mode == .training && trainingWithAI) {
                        difficultySection
                        sideSection
                    }
                    arenaSection
                }
                .padding(.bottom, 20)
            }
            .scrollIndicators(.hidden)
            Button {
                start()
            } label: {
                Text("Spiel starten").frame(maxWidth: 380)
            }
            .buttonStyle(PrimaryButtonStyle())
            .accessibilityIdentifier("startGameButton")
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 18)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            difficulty = app.settings.lastDifficulty
            humanPlaysSun = app.settings.humanPlaysSun
            if let arena = Arena.named(app.settings.lastArenaID), app.profile.isUnlocked(arena) { arenaID = arena.id }
        }
    }

    private func start() {
        let config: MatchConfig
        switch mode {
        case .versusAI:
            config = MatchConfig(mode: .versusAI, arenaID: arenaID, difficulty: difficulty, aiPlayer: humanPlaysSun ? .moon : .sun)
        case .training:
            config = MatchConfig(mode: .training, arenaID: arenaID, difficulty: trainingWithAI ? difficulty : nil,
                                 aiPlayer: trainingWithAI ? (humanPlaysSun ? .moon : .sun) : nil)
        default:
            config = MatchConfig(mode: .localDuel, arenaID: arenaID)
        }
        app.sound.play(.tap)
        app.startMatch(config)
    }

    // MARK: Sections

    private var modeSection: some View {
        VStack(spacing: 12) {
            SectionTitle(text: "Modus")
            HStack(spacing: 14) {
                modeCard(.versusAI, icon: "cpu", text: "Gegen die KI in vier Stufen. Zählt für Statistik und XP.")
                modeCard(.localDuel, icon: "person.2.fill", text: "Zwei Spieler, ein iPad. Optional im Tischmodus.")
                modeCard(.training, icon: "lightbulb.fill", text: "Freies Spiel ohne Wertung: Rücknahmen und KI-Hinweise.")
            }
            if mode == .training {
                Toggle(isOn: $trainingWithAI) {
                    Text("Mit KI-Gegner trainieren").font(Theme.body(17)).foregroundStyle(Theme.textPrimary)
                }
                .padding(.horizontal, 18).frame(minHeight: 56)
                .glassPanel(cornerRadius: 18)
            }
        }
    }

    private func modeCard(_ m: GameMode, icon: String, text: String) -> some View {
        let selected = mode == m
        return Button {
            app.sound.play(.tap)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { mode = m }
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(selected ? Theme.crystal : Theme.textSecondary)
                Text(m.displayName)
                    .font(Theme.heading(20))
                    .foregroundStyle(Theme.textPrimary)
                Text(text)
                    .font(Theme.body(14))
                    .foregroundStyle(Theme.textSecondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(18)
            .frame(maxWidth: .infinity, minHeight: 170, alignment: .topLeading)
            .glassPanel(cornerRadius: 22, highlighted: selected ? Theme.crystal : nil)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityIdentifier("mode-\(m.rawValue)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var difficultySection: some View {
        VStack(spacing: 12) {
            SectionTitle(text: "Gegner")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 210), spacing: 14)], spacing: 14) {
                ForEach(Difficulty.allCases) { d in
                    let selected = difficulty == d
                    let record = app.profile.stats.record(for: d)
                    Button {
                        app.sound.play(.tap)
                        withAnimation(.spring(response: 0.3)) { difficulty = d }
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(d.displayName).font(Theme.heading(19)).foregroundStyle(Theme.textPrimary)
                                Spacer()
                                StrengthBars(level: Difficulty.allCases.firstIndex(of: d)! + 1)
                            }
                            Text(d.summary)
                                .font(Theme.body(14)).foregroundStyle(Theme.textSecondary)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(record.total == 0 ? "Noch nicht gespielt" : "\(record.wins) S · \(record.losses) N · \(record.draws) R")
                                .font(Theme.label(12)).foregroundStyle(Theme.textMuted)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, minHeight: 130, alignment: .topLeading)
                        .glassPanel(cornerRadius: 20, highlighted: selected ? Theme.energy : nil)
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityIdentifier("difficulty-\(d.rawValue)")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }

    private var sideSection: some View {
        VStack(spacing: 12) {
            SectionTitle(text: "Deine Seite")
            HStack(spacing: 14) {
                sideButton(sun: true)
                sideButton(sun: false)
            }
        }
    }

    private func sideButton(sun: Bool) -> some View {
        let selected = humanPlaysSun == sun
        let player: Player = sun ? .sun : .moon
        return Button {
            app.sound.play(.tap)
            withAnimation(.spring(response: 0.3)) { humanPlaysSun = sun }
        } label: {
            HStack(spacing: 14) {
                StoneView(owner: StoneOwner(player), palette: app.palette, diameter: 40, highlighted: selected)
                VStack(alignment: .leading, spacing: 2) {
                    Text(sun ? "Sonne" : "Mond").font(Theme.heading(18)).foregroundStyle(Theme.textPrimary)
                    Text(sun ? "Beginnt die Partie" : "Startet mit 1 Energie")
                        .font(Theme.body(13)).foregroundStyle(Theme.textSecondary)
                }
                Spacer()
            }
            .padding(14)
            .frame(maxWidth: .infinity)
            .glassPanel(cornerRadius: 20, highlighted: selected ? app.palette.palette(for: player).glow : nil)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityIdentifier(sun ? "side-sun" : "side-moon")
    }

    private var arenaSection: some View {
        VStack(spacing: 12) {
            SectionTitle(text: "Arena")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 14)], spacing: 14) {
                ForEach(Arena.catalog) { arena in
                    let unlocked = app.profile.isUnlocked(arena)
                    let selected = arenaID == arena.id
                    Button {
                        guard unlocked else {
                            app.sound.play(.invalid)
                            return
                        }
                        app.sound.play(.tap)
                        withAnimation(.spring(response: 0.3)) { arenaID = arena.id }
                    } label: {
                        VStack(alignment: .leading, spacing: 10) {
                            ArenaPreview(arena: arena, palette: app.palette)
                                .frame(height: 96)
                                .opacity(unlocked ? 1 : 0.3)
                                .overlay {
                                    if !unlocked {
                                        Label("Ab Level \(arena.unlockLevel)", systemImage: "lock.fill")
                                            .font(Theme.label(14))
                                            .foregroundStyle(Theme.textPrimary)
                                            .padding(.horizontal, 12).padding(.vertical, 6)
                                            .background(Capsule().fill(Color.black.opacity(0.55)))
                                    }
                                }
                            Text(arena.name).font(Theme.heading(18)).foregroundStyle(Theme.textPrimary)
                            Text(arena.tagline)
                                .font(Theme.body(13)).foregroundStyle(Theme.textSecondary)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Text("\(arena.columns)×\(arena.rows) · \(arena.crystals.count) Kristalle")
                                .font(Theme.label(12)).foregroundStyle(Theme.textMuted)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, minHeight: 230, alignment: .topLeading)
                        .glassPanel(cornerRadius: 20, highlighted: selected ? Theme.crystal : nil)
                    }
                    .buttonStyle(PressScaleStyle())
                    .accessibilityIdentifier("arena-\(arena.id)")
                    .accessibilityLabel(unlocked ? arena.name : "\(arena.name), gesperrt bis Level \(arena.unlockLevel)")
                }
            }
        }
    }
}

struct StrengthBars: View {
    let level: Int
    var body: some View {
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(1...4, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(i <= level ? Theme.energy : Color.white.opacity(0.15))
                    .frame(width: 6, height: CGFloat(6 + i * 4))
            }
        }
        .accessibilityLabel("Stärke \(level) von 4")
    }
}

/// Miniature of an arena layout (obstacles and crystals) used in pickers and rules.
struct ArenaPreview: View {
    let arena: Arena
    let palette: SkinPalette

    var body: some View {
        GeometryReader { geo in
            let cell = min(geo.size.width / CGFloat(arena.columns), geo.size.height / CGFloat(arena.rows))
            let w = cell * CGFloat(arena.columns), h = cell * CGFloat(arena.rows)
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: cell * 0.3, style: .continuous)
                    .fill(LinearGradient(colors: [Color(hex: 0x24306A), Color(hex: 0x0C1230)], startPoint: .top, endPoint: .bottom))
                    .frame(width: w, height: h)
                ForEach(0..<arena.columns, id: \.self) { c in
                    ForEach(0..<arena.rows, id: \.self) { r in
                        let cellPos = Cell(c, r)
                        let center = CGPoint(x: (CGFloat(c) + 0.5) * cell, y: (CGFloat(arena.rows - 1 - r) + 0.5) * cell)
                        Group {
                            if arena.obstacles.contains(cellPos) {
                                StoneView(owner: .neutral, palette: palette, diameter: cell * 0.8)
                            } else if arena.crystals.contains(cellPos) {
                                CrystalGlyph(size: cell * 0.6, glowing: false)
                            } else {
                                Circle().fill(Color.black.opacity(0.35)).frame(width: cell * 0.72, height: cell * 0.72)
                            }
                        }
                        .position(center)
                    }
                }
            }
            .frame(width: w, height: h)
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
        .accessibilityHidden(true)
    }
}
