import SwiftUI
import KaskadeCore

/// The game screen. Landscape: panels left and right of the board. Portrait: above and below.
struct GameView: View {
    @Environment(AppModel.self) private var app
    let controller: GameController
    @State private var confirmation: Confirmation?

    enum Confirmation: Identifiable {
        case restart, resign, leave
        var id: Self { self }
    }

    var body: some View {
        GeometryReader { geo in
            let landscape = geo.size.width > geo.size.height * 1.05
            ZStack {
                VStack(spacing: 14) {
                    topBar
                    if landscape {
                        HStack(alignment: .center, spacing: 20) {
                            PlayerPanel(controller: controller, player: .sun, compact: false)
                            boardColumn
                            PlayerPanel(controller: controller, player: .moon, compact: false)
                        }
                    } else {
                        VStack(spacing: 14) {
                            PlayerPanel(controller: controller, player: topPlayer, compact: true)
                                .rotationEffect(.degrees(rotateTopPanel ? 180 : 0))
                            boardColumn
                            PlayerPanel(controller: controller, player: topPlayer.opponent, compact: true)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .blur(radius: controller.isPaused || controller.showResult ? 8 : 0)
                .allowsHitTesting(!controller.isPaused && !controller.showResult)

                if controller.isPaused { pauseOverlay.transition(.opacity) }
                if controller.showResult { ResultOverlay(controller: controller).transition(.scale(scale: 0.9).combined(with: .opacity)) }
            }
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .defersSystemGestures(on: .bottom)
        .alert(item: $confirmation) { kind in
            switch kind {
            case .restart:
                return Alert(title: Text("Partie neu starten?"), message: Text("Der aktuelle Spielstand geht verloren."),
                             primaryButton: .destructive(Text("Neu starten")) { controller.restart() },
                             secondaryButton: .cancel(Text("Abbrechen")))
            case .resign:
                return Alert(title: Text("Aufgeben?"), message: Text("Die Partie zählt als Niederlage."),
                             primaryButton: .destructive(Text("Aufgeben")) { controller.resign() },
                             secondaryButton: .cancel(Text("Weiterspielen")))
            case .leave:
                return Alert(title: Text("Zum Hauptmenü?"), message: Text(leaveMessage),
                             primaryButton: .default(Text("Verlassen")) { app.leaveGame() },
                             secondaryButton: .cancel(Text("Bleiben")))
            }
        }
    }

    private var leaveMessage: String {
        controller.kind == .standard ? "Die Partie wird gespeichert und kann fortgesetzt werden." : "Der Fortschritt dieser Runde geht verloren."
    }

    /// In portrait, the opponent (or moon) sits on top.
    private var topPlayer: Player {
        if let ai = controller.match.config.aiPlayer { return ai }
        return .moon
    }

    private var rotateTopPanel: Bool {
        controller.match.config.mode == .localDuel && app.settings.tableMode
    }

    // MARK: Bars

    private var topBar: some View {
        HStack(spacing: 12) {
            IconButton(systemName: "pause.fill", label: "Pause") {
                app.sound.play(.tap)
                withAnimation(.easeInOut(duration: 0.25)) { controller.isPaused = true }
            }
            .accessibilityIdentifier("pauseButton")
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.heading(20))
                    .foregroundStyle(Theme.textPrimary)
                Text(subtitle)
                    .font(Theme.label(13))
                    .foregroundStyle(Theme.textMuted)
            }
            Spacer()
            if controller.showsHintButton {
                IconButton(systemName: controller.hintLoading ? "hourglass" : "lightbulb.fill", label: "Hinweis",
                           enabled: controller.isHumanTurn) { controller.requestHint() }
                    .accessibilityIdentifier("hintButton")
            }
            if controller.kind == .standard {
                IconButton(systemName: "arrow.uturn.backward", label: "Zug zurücknehmen", enabled: controller.canUndo) {
                    controller.undo()
                }
                .accessibilityIdentifier("undoButton")
            }
        }
    }

    private var title: String {
        switch controller.kind {
        case .tutorial: return "Tutorial"
        case .puzzle(let p): return "Rätsel · \(p.title)"
        case .standard: return controller.match.config.mode.displayName
        }
    }

    private var subtitle: String {
        switch controller.kind {
        case .tutorial: return "Schritt \(controller.tutorialIndex + 1) von \(Tutorial.steps.count)"
        case .puzzle(let p): return p.goal
        case .standard:
            let arena = controller.match.config.arena?.name ?? ""
            if controller.match.undoCount > 0 && controller.match.config.mode == .versusAI {
                return "\(arena) · mit Rücknahme (halbe XP)"
            }
            return arena
        }
    }

    private var boardColumn: some View {
        VStack(spacing: 10) {
            StatusBanner(controller: controller)
            BoardView(controller: controller)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            guidanceCard
                .frame(maxWidth: 640)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Guidance (tutorial / puzzle)

    @ViewBuilder private var guidanceCard: some View {
        if let step = controller.tutorialStep {
            TutorialCard(controller: controller, step: step)
        } else if let puzzle = controller.puzzle {
            PuzzleCard(controller: controller, puzzle: puzzle)
        }
    }

    // MARK: Pause

    private var pauseOverlay: some View {
        ZStack {
            Color.black.opacity(0.45).ignoresSafeArea()
                .onTapGesture { controller.isPaused = false }
            VStack(spacing: 14) {
                Text("Pause")
                    .font(Theme.title(40))
                    .foregroundStyle(Theme.textPrimary)
                Button("Weiterspielen") {
                    withAnimation { controller.isPaused = false }
                }
                .buttonStyle(PrimaryButtonStyle())
                .accessibilityIdentifier("resumeButton")
                if controller.kind != .tutorial {
                    Button("Neu starten") { confirmation = .restart }
                        .buttonStyle(SecondaryButtonStyle())
                }
                Button("Regeln ansehen") { app.show(.rules) }
                    .buttonStyle(SecondaryButtonStyle())
                HStack(spacing: 12) {
                    toggleChip(icon: app.settings.soundEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill",
                               label: "Effekte", on: app.settings.soundEnabled) { app.settings.soundEnabled.toggle() }
                    toggleChip(icon: "music.note", label: "Musik", on: app.settings.musicEnabled) { app.settings.musicEnabled.toggle() }
                }
                if controller.match.config.mode == .versusAI && !controller.match.isOver {
                    Button("Aufgeben") { confirmation = .resign }
                        .buttonStyle(SecondaryButtonStyle())
                        .foregroundStyle(Theme.danger)
                }
                Button("Zum Hauptmenü") { confirmation = .leave }
                    .buttonStyle(SecondaryButtonStyle())
                    .accessibilityIdentifier("leaveButton")
            }
            .frame(width: 340)
            .padding(30)
            .glassPanel(cornerRadius: 32)
        }
    }

    private func toggleChip(icon: String, label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: icon)
                .font(Theme.label(15))
                .foregroundStyle(on ? Color(hex: 0x0B1128) : Theme.textPrimary)
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(Capsule().fill(on ? Theme.crystal : Theme.glassStrong))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// Current turn / instruction, or a feedback message after an invalid action.
struct StatusBanner: View {
    let controller: GameController

    var body: some View {
        let feedback = controller.feedback
        let text = feedback?.message ?? controller.statusText
        let isError = feedback?.isError ?? false
        HStack(spacing: 10) {
            if isError {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.danger)
            } else if let a = controller.armedAbility {
                AbilityIcon(ability: a, size: 20, color: Theme.crystal)
            } else if controller.state.outcome == .ongoing {
                Circle()
                    .fill(controller.palette.palette(for: controller.state.toMove).base)
                    .frame(width: 12, height: 12)
            }
            Text(text)
                .font(Theme.heading(18))
                .foregroundStyle(isError ? Theme.danger : Theme.textPrimary)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            if controller.armedAbility != nil && controller.isHumanTurn {
                Button("Abbrechen") { controller.armedAbility = nil }
                    .font(Theme.label(14))
                    .foregroundStyle(Theme.textSecondary)
                    .padding(.leading, 6)
            }
        }
        .padding(.horizontal, 18)
        .frame(minHeight: 46)
        .background(Capsule().fill(isError ? Theme.danger.opacity(0.15) : Theme.glass))
        .overlay(Capsule().strokeBorder(isError ? Theme.danger.opacity(0.5) : Theme.hairline, lineWidth: 1))
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: text)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("statusBanner")
    }
}

// MARK: Tutorial and puzzle cards

struct TutorialCard: View {
    @Environment(AppModel.self) private var app
    let controller: GameController
    let step: TutorialStep

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if controller.tutorialFinished {
                Text("Geschafft!")
                    .font(Theme.title(28))
                    .foregroundStyle(Theme.textPrimary)
                Text("Du kennst jetzt alle Regeln. Zeit für deine erste echte Partie.")
                    .font(Theme.body(17))
                    .foregroundStyle(Theme.textSecondary)
                HStack {
                    Button("Gegen Lehrling spielen") {
                        app.startMatch(MatchConfig(mode: .versusAI, arenaID: Arena.origin.id, difficulty: .apprentice, aiPlayer: .moon))
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    Button("Menü") { app.leaveGame() }
                        .buttonStyle(SecondaryButtonStyle())
                }
            } else {
                HStack {
                    if let a = step.focusAbility { AbilityIcon(ability: a, size: 24, color: Theme.crystal) }
                    Text(step.title)
                        .font(Theme.heading(22))
                        .foregroundStyle(Theme.textPrimary)
                    Spacer()
                    Text("\(step.id)/\(Tutorial.steps.count)")
                        .font(Theme.label(14))
                        .foregroundStyle(Theme.textMuted)
                }
                Text(controller.tutorialStepDone ? step.success : step.instruction)
                    .font(Theme.body(17))
                    .foregroundStyle(controller.tutorialStepDone ? Theme.success : Theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                if controller.tutorialStepDone {
                    Button(step.id == Tutorial.steps.count ? "Abschließen" : "Weiter") {
                        app.sound.play(.tap)
                        withAnimation { controller.nextTutorialStep() }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .accessibilityIdentifier("tutorialNext")
                }
            }
        }
        .padding(20)
        .glassPanel(cornerRadius: 26, highlighted: controller.tutorialStepDone ? Theme.success.opacity(0.7) : nil)
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: controller.tutorialStepDone)
    }
}

struct PuzzleCard: View {
    @Environment(AppModel.self) private var app
    let controller: GameController
    let puzzle: Puzzle
    @State private var showHint = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(puzzle.goal)
                    .font(Theme.heading(20))
                    .foregroundStyle(Theme.textPrimary)
                Spacer()
                Text("Züge: \(controller.puzzleTurnsUsed)/\(puzzle.turns)")
                    .font(Theme.label(14))
                    .foregroundStyle(Theme.textMuted)
            }
            if controller.puzzleSolved {
                Text("Gelöst!" + ((controller.reward?.xpGained ?? 0) > 0 ? "  +\(controller.reward!.xpGained) XP" : ""))
                    .font(Theme.heading(18))
                    .foregroundStyle(Theme.success)
                HStack {
                    if let next = nextPuzzle {
                        Button("Nächstes Rätsel") { app.startPuzzle(next) }.buttonStyle(PrimaryButtonStyle())
                    }
                    Button("Übersicht") { app.leaveGame() }.buttonStyle(SecondaryButtonStyle())
                }
            } else if controller.puzzleFailed {
                Text("Nicht gelöst. Die Verteidigung hält.")
                    .font(Theme.heading(18))
                    .foregroundStyle(Theme.danger)
                Button("Nochmal versuchen") { controller.restart() }
                    .buttonStyle(PrimaryButtonStyle())
            } else {
                if showHint {
                    Text(puzzle.hint)
                        .font(Theme.body(16))
                        .foregroundStyle(Theme.energy)
                } else {
                    Button("Tipp anzeigen") { withAnimation { showHint = true } }
                        .font(Theme.label(15))
                        .foregroundStyle(Theme.textSecondary)
                }
            }
        }
        .padding(18)
        .glassPanel(cornerRadius: 24, highlighted: controller.puzzleSolved ? Theme.success.opacity(0.7) : nil)
    }

    private var nextPuzzle: Puzzle? {
        guard let i = Puzzle.catalog.firstIndex(of: puzzle), i + 1 < Puzzle.catalog.count else { return nil }
        return Puzzle.catalog[i + 1]
    }
}
