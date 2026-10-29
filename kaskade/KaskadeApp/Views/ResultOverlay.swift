import SwiftUI
import KaskadeCore

/// End-of-match card with outcome, XP progress, unlocks and next actions.
struct ResultOverlay: View {
    @Environment(AppModel.self) private var app
    let controller: GameController
    @State private var barProgress: Double = 0

    private var outcome: Outcome { controller.state.outcome }

    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()
            VStack(spacing: 18) {
                headline
                if let reward = controller.reward, controller.match.config.mode.isRated {
                    rewardSection(reward)
                }
                HStack(spacing: 14) {
                    Button("Revanche") {
                        app.sound.play(.tap)
                        controller.restart()
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .accessibilityIdentifier("rematchButton")
                    Button("Hauptmenü") { app.leaveGame() }
                        .buttonStyle(SecondaryButtonStyle())
                        .accessibilityIdentifier("resultMenuButton")
                }
            }
            .padding(34)
            .frame(maxWidth: 520)
            .glassPanel(cornerRadius: 34, highlighted: accent.opacity(0.8))
            .padding(24)
        }
        .onAppear {
            guard let reward = controller.reward else { return }
            let before = Self.progress(xp: app.profile.xp - reward.xpGained)
            barProgress = before
            withAnimation(.easeOut(duration: 1.2).delay(0.3)) {
                barProgress = reward.levelAfter > reward.levelBefore ? 1 : app.profile.levelProgress
            }
        }
    }

    private static func progress(xp: Int) -> Double {
        let level = Profile.level(forXP: xp)
        let lo = Profile.xpRequired(for: level)
        let hi = Profile.xpRequired(for: level + 1)
        return Double(xp - lo) / Double(hi - lo)
    }

    private var headlineText: (String, String) {
        if controller.resigned { return ("Aufgegeben", "Beim nächsten Mal klappt es.") }
        switch outcome {
        case .win(let p):
            switch controller.match.config.mode {
            case .versusAI:
                return p == controller.match.config.aiPlayer
                    ? ("Niederlage", "Die KI war diesmal schneller.")
                    : ("Sieg!", "Stark gespielt gegen \(controller.match.config.difficulty?.displayName ?? "die KI").")
            default:
                return ("\(controller.displayName(for: p)) gewinnt!", "Vier in einer Reihe.")
            }
        case .draw: return ("Remis", "Das Brett ist erschöpft, niemand kann mehr ziehen.")
        case .ongoing: return ("", "")
        }
    }

    private var accent: Color {
        if controller.resigned { return Theme.danger }
        switch outcome {
        case .win(let p):
            if controller.match.config.mode == .versusAI && p == controller.match.config.aiPlayer { return Theme.danger }
            return controller.palette.palette(for: p).glow
        default: return Theme.textSecondary
        }
    }

    private var headline: some View {
        VStack(spacing: 8) {
            if case .win(let p) = outcome, !controller.resigned {
                StoneView(owner: StoneOwner(p), palette: controller.palette, diameter: 72, highlighted: true)
            }
            Text(headlineText.0)
                .font(Theme.title(44))
                .foregroundStyle(Theme.textPrimary)
                .accessibilityIdentifier("resultTitle")
            Text(headlineText.1)
                .font(Theme.body(17))
                .foregroundStyle(Theme.textSecondary)
                .multilineTextAlignment(.center)
        }
    }

    private func rewardSection(_ reward: Reward) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("+\(reward.xpGained) XP")
                    .font(Theme.heading(22))
                    .foregroundStyle(Theme.energy)
                Spacer()
                Text("Level \(reward.levelAfter)")
                    .font(Theme.heading(18))
                    .foregroundStyle(Theme.textPrimary)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.1))
                    Capsule()
                        .fill(LinearGradient(colors: [Theme.energy, Color(hex: 0xFFA733)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(12, g.size.width * barProgress))
                }
            }
            .frame(height: 12)
            if controller.match.undoCount > 0 && controller.match.config.mode == .versusAI {
                Text("Mit Rücknahme gespielt: halbe XP, keine Erfolge.")
                    .font(Theme.body(13))
                    .foregroundStyle(Theme.textMuted)
            }
            if reward.levelAfter > reward.levelBefore {
                Label("Level \(reward.levelAfter) erreicht!", systemImage: "sparkles")
                    .font(Theme.heading(17))
                    .foregroundStyle(Theme.crystal)
            }
            ForEach(reward.unlockedArenas) { arena in
                Label("Neue Arena: \(arena.name)", systemImage: "square.grid.3x3.fill")
                    .font(Theme.body(16)).foregroundStyle(Theme.textPrimary)
            }
            ForEach(reward.unlockedSkins) { skin in
                Label("Neues Steindesign: \(skin.name)", systemImage: "paintpalette.fill")
                    .font(Theme.body(16)).foregroundStyle(Theme.textPrimary)
            }
            ForEach(reward.newAchievements) { a in
                Label("Erfolg: \(a.title)", systemImage: "rosette")
                    .font(Theme.body(16)).foregroundStyle(Theme.energy)
            }
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.white.opacity(0.05)))
    }
}
