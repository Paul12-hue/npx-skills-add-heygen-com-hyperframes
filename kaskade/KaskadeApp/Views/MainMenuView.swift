import SwiftUI
import KaskadeCore

struct MainMenuView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        GeometryReader { geo in
            let landscape = geo.size.width > geo.size.height
            ZStack {
                MenuCascade(palette: app.palette, reduceMotion: app.settings.reduceMotion)
                    .opacity(0.55)
                VStack(spacing: 0) {
                    HStack {
                        LevelBadge(profile: app.profile)
                        Spacer()
                        IconButton(systemName: "gearshape.fill", label: "Einstellungen") { app.show(.settings) }
                            .accessibilityIdentifier("settingsButton")
                    }
                    Spacer(minLength: 10)
                    VStack(spacing: 10) {
                        Wordmark(size: landscape ? 92 : 80)
                        Text("Vier in einer Reihe, neu erfunden.")
                            .font(Theme.body(20))
                            .foregroundStyle(Theme.textSecondary)
                    }
                    Spacer(minLength: 24)
                    menu
                        .frame(maxWidth: 440)
                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 18)
            }
        }
    }

    private var menu: some View {
        VStack(spacing: 14) {
            if let snap = app.savedSnapshot {
                Button {
                    app.resumeSavedMatch()
                } label: {
                    VStack(spacing: 2) {
                        Text("Fortsetzen")
                        Text("\(snap.config.mode.displayName) · \(snap.config.arena?.name ?? "")")
                            .font(Theme.label(13)).opacity(0.75)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle(tint: Theme.crystal, tintDeep: Theme.crystalDeep))
                .accessibilityIdentifier("resumeGameButton")
            }
            Button {
                app.show(.newGame)
            } label: {
                Text("Neues Spiel").frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
            .accessibilityIdentifier("newGameButton")

            HStack(spacing: 14) {
                menuTile("Rätsel", icon: "puzzlepiece.extension.fill", id: "puzzlesButton") { app.show(.puzzles) }
                menuTile(app.profile.tutorialCompleted ? "Tutorial" : "Tutorial ★", icon: "graduationcap.fill", id: "tutorialButton") {
                    app.sound.play(.tap)
                    app.startTutorial()
                }
            }
            HStack(spacing: 14) {
                menuTile("Regeln", icon: "book.closed.fill", id: "rulesButton") { app.show(.rules) }
                menuTile("Statistik", icon: "chart.bar.fill", id: "statsButton") { app.show(.stats) }
            }
        }
    }

    private func menuTile(_ title: String, icon: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).frame(maxWidth: .infinity)
        }
        .buttonStyle(SecondaryButtonStyle())
        .accessibilityIdentifier(id)
    }
}

struct LevelBadge: View {
    let profile: Profile

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().stroke(Color.white.opacity(0.12), lineWidth: 5)
                Circle()
                    .trim(from: 0, to: profile.levelProgress)
                    .stroke(Theme.energy, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(profile.level)")
                    .font(Theme.heading(20))
                    .foregroundStyle(Theme.textPrimary)
            }
            .frame(width: 52, height: 52)
            VStack(alignment: .leading, spacing: 2) {
                Text("Level \(profile.level)")
                    .font(Theme.heading(17))
                    .foregroundStyle(Theme.textPrimary)
                Text("\(profile.xp - Profile.xpRequired(for: profile.level)) / \(Profile.xpRequired(for: profile.level + 1) - Profile.xpRequired(for: profile.level)) XP")
                    .font(Theme.label(13))
                    .foregroundStyle(Theme.textMuted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .glassPanel(cornerRadius: 22)
        .accessibilityElement(children: .combine)
    }
}

/// Decorative stones cascading down behind the menu.
private struct MenuCascade: View {
    let palette: SkinPalette
    let reduceMotion: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            GeometryReader { geo in
                ForEach(0..<14, id: \.self) { i in
                    let seed = Double(i) * 1.618
                    let speed = 0.035 + 0.03 * abs(sin(seed * 2.3))
                    let x = (abs(sin(seed * 7.1)) * 0.92 + 0.04) * geo.size.width
                    let progress = (t * speed + abs(cos(seed))).truncatingRemainder(dividingBy: 1)
                    let y = -80 + progress * (geo.size.height + 160)
                    let owner: StoneOwner = i % 5 == 4 ? .neutral : (i % 2 == 0 ? .sun : .moon)
                    StoneView(owner: owner, palette: palette, diameter: 40 + 34 * abs(sin(seed * 3.3)))
                        .position(x: x, y: y)
                        .opacity(0.35 + 0.4 * abs(sin(seed)))
                        .blur(radius: i % 3 == 0 ? 3 : 0)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
