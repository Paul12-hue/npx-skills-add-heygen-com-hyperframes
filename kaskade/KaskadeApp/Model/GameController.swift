import SwiftUI
import Observation
import KaskadeCore

/// How a stone enters the board, so the view can animate it accordingly.
enum StoneEntry: Equatable {
    case fall(rows: Int)
    case rise
}

/// Short-lived visual events on the board (crystal bursts, rift shards, geyser jets).
struct BoardEvent: Identifiable, Equatable {
    enum Kind: Equatable {
        case crystal(Cell, Player?)
        case shatter(Cell, StoneOwner)
        case geyser(column: Int)
        case anchor(Cell)
    }
    let id = UUID()
    let kind: Kind
}

struct Feedback: Identifiable, Equatable {
    let id = UUID()
    let message: String
    let column: Int?
    let isError: Bool
}

/// Runs the search off the main thread. One engine per worker, used serially.
actor AIWorker {
    private let engine = SearchEngine()
    private var rng = SystemRandomNumberGenerator()

    func chooseMove(for state: GameState, config: AIConfig) -> Move? {
        engine.chooseMove(for: state, config: config, rng: &rng)
    }
}

/// Mediates between the rules (`Match`) and the game screen: input validation, AI turns,
/// animations, sounds, tutorial and puzzle flow, and result recording.
@Observable
@MainActor
final class GameController {
    enum Kind: Equatable {
        case standard
        case tutorial
        case puzzle(Puzzle)
    }

    let kind: Kind
    private(set) var match: Match
    private(set) var tracker: PieceTracker
    private(set) var entries: [Int: StoneEntry] = [:]
    private(set) var events: [BoardEvent] = []
    private(set) var feedback: Feedback?
    private(set) var aiThinking = false
    private(set) var hint: Move?
    private(set) var hintLoading = false
    private(set) var reward: Reward?
    private(set) var showResult = false
    /// The human gave up (counts as a loss against the AI).
    private(set) var resigned = false
    private(set) var lastMoveCells: Set<Cell> = []
    var armedAbility: Ability?
    var isPaused = false {
        didSet { if !isPaused { scheduleAIIfNeeded() } }
    }

    // Tutorial
    private(set) var tutorialIndex = 0
    private(set) var tutorialPartial: [Move] = []
    private(set) var tutorialStepDone = false
    private(set) var tutorialFinished = false

    // Puzzle
    private(set) var puzzleTurnsUsed = 0
    private(set) var puzzleSolved = false
    private(set) var puzzleFailed = false

    @ObservationIgnored private weak var app: AppModel?
    @ObservationIgnored private let worker = AIWorker()
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var resultRecorded = false
    @ObservationIgnored private var tasks: [Task<Void, Never>] = []

    init(app: AppModel, match: Match, kind: Kind) {
        self.app = app
        self.match = match
        self.kind = kind
        tracker = PieceTracker(initial: match.initialState, history: match.history)
    }

    static func tutorial(app: AppModel) -> GameController {
        let step = Tutorial.steps[0]
        let match = Match(config: MatchConfig(mode: .tutorial, arenaID: "tutorial"), initialState: step.makeState())
        return GameController(app: app, match: match, kind: .tutorial)
    }

    static func puzzle(app: AppModel, puzzle: Puzzle) -> GameController? {
        let config = MatchConfig(mode: .puzzle, arenaID: "puzzle", difficulty: .grandmaster,
                                 aiPlayer: puzzle.attacker.opponent, puzzleID: puzzle.id)
        guard let match = try? Match(config: config) else { return nil }
        return GameController(app: app, match: match, kind: .puzzle(puzzle))
    }

    func begin() {
        if match.isOver { finishGame(animated: false) } else { scheduleAIIfNeeded() }
    }

    func tearDown() {
        generation += 1
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
    }

    // MARK: Derived state

    var state: GameState { match.state }
    var geometry: Geometry { match.state.geometry }
    var palette: SkinPalette { app?.palette ?? SkinPalette.forSkin("ember") }
    var settings: Settings { app?.settings ?? Settings() }

    var tutorialStep: TutorialStep? {
        kind == .tutorial ? Tutorial.steps[tutorialIndex] : nil
    }

    var puzzle: Puzzle? {
        if case .puzzle(let p) = kind { return p }
        return nil
    }

    var isHumanTurn: Bool {
        !match.isOver && !match.isAITurn && !aiThinking && !isPaused && !(kind == .tutorial && tutorialStepDone)
            && !(puzzleFailed || puzzleSolved) && !resigned
    }

    var canUndo: Bool {
        guard !aiThinking, kind != .tutorial, puzzle == nil else { return false }
        return match.canUndo && !match.isOver
    }

    var showsHintButton: Bool { match.config.mode == .training }

    func displayName(for player: Player) -> String {
        switch match.config.mode {
        case .versusAI:
            if player == match.config.aiPlayer { return "KI · \(match.config.difficulty?.displayName ?? "")" }
            return "Du"
        case .localDuel:
            let name = player == .sun ? settings.sunName : settings.moonName
            return name.trimmingCharacters(in: .whitespaces).isEmpty ? (player == .sun ? "Sonne" : "Mond") : name
        case .puzzle:
            return player == match.config.aiPlayer ? "Verteidigung" : "Du"
        case .tutorial:
            return player == .sun ? "Du" : "Mond"
        case .training:
            if player == match.config.aiPlayer { return "KI · \(match.config.difficulty?.displayName ?? "")" }
            return player == .sun ? "Sonne" : "Mond"
        }
    }

    var statusText: String {
        let s = state
        switch s.outcome {
        case .win(let p):
            if match.config.mode == .versusAI || puzzle != nil || kind == .tutorial {
                return p == match.config.aiPlayer || (kind == .tutorial && p == .moon) ? "Niederlage" : "Sieg!"
            }
            return "\(displayName(for: p)) gewinnt!"
        case .draw:
            return "Remis, das Brett ist erschöpft."
        case .ongoing:
            break
        }
        if aiThinking { return "\(displayName(for: s.toMove)) überlegt …" }
        if s.awaitingFollowUpDrop { return "Jetzt folgt dein normaler Wurf." }
        if let a = armedAbility { return "\(a.displayName): Wähle eine Spalte." }
        let name = displayName(for: s.toMove)
        return name == "Du" ? "Du bist am Zug." : "\(name) ist am Zug."
    }

    /// Columns where the current action would be legal (for hints and highlighting).
    var legalColumns: Set<Int> {
        guard isHumanTurn else { return [] }
        if let step = tutorialStep, !step.allowedTurns.isEmpty {
            return Set(step.highlightedColumns(after: tutorialPartial))
        }
        let kind: Move.Kind = armedAbility.map { abilityKind($0) } ?? .drop
        return Set((0..<geometry.columns).filter { state.isLegal(Move(kind, $0)) })
    }

    func canAfford(_ ability: Ability) -> Bool {
        state.abilitiesEnabled && state.energy(of: state.toMove) >= ability.cost && !state.awaitingFollowUpDrop
    }

    // MARK: Input

    func tapColumn(_ column: Int) {
        guard !match.isOver else { return }
        guard isHumanTurn else {
            if aiThinking || match.isAITurn { showFeedback("Warte, der Gegner ist am Zug.", column: nil, error: true) }
            return
        }
        let move = Move(armedAbility.map { abilityKind($0) } ?? .drop, column)
        if let step = tutorialStep, !step.accepts(move, after: tutorialPartial) {
            showFeedback(tutorialCorrection(for: step), column: column, error: true)
            return
        }
        if let violation = state.check(move) {
            showFeedback(message(for: violation), column: column, error: true)
            return
        }
        perform(move)
    }

    func toggleAbility(_ ability: Ability) {
        guard isHumanTurn else { return }
        guard state.abilitiesEnabled else {
            showFeedback("In dieser Arena gibt es keine Fähigkeiten.", column: nil, error: true)
            return
        }
        if state.awaitingFollowUpDrop {
            showFeedback("Erst den normalen Wurf beenden.", column: nil, error: true)
            return
        }
        let have = state.energy(of: state.toMove)
        if have < ability.cost {
            showFeedback("\(ability.displayName) braucht \(ability.cost) Energie, du hast \(have).", column: nil, error: true)
            return
        }
        app?.sound.play(.tap)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
            armedAbility = armedAbility == ability ? nil : ability
        }
    }

    func undo() {
        guard canUndo else { return }
        generation += 1
        aiThinking = false
        do {
            try match.undo()
        } catch {
            return
        }
        armedAbility = nil
        hint = nil
        events.removeAll()
        lastMoveCells = []
        withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) {
            tracker = PieceTracker(initial: match.initialState, history: match.history)
        }
        app?.sound.play(.tap)
        app?.persist(match)
        scheduleAIIfNeeded()
    }

    func restart() {
        generation += 1
        aiThinking = false
        match.restart()
        armedAbility = nil
        hint = nil
        reward = nil
        showResult = false
        resigned = false
        resultRecorded = false
        events.removeAll()
        lastMoveCells = []
        puzzleTurnsUsed = 0
        puzzleFailed = false
        puzzleSolved = false
        tutorialPartial = []
        tutorialStepDone = false
        entries.removeAll()
        withAnimation(.easeInOut(duration: 0.3)) {
            tracker = PieceTracker(state: match.initialState)
        }
        isPaused = false
        app?.persist(match)
        scheduleAIIfNeeded()
    }

    /// Counts as a loss against the AI.
    func resign() {
        guard match.config.mode == .versusAI, !match.isOver, let ai = match.config.aiPlayer else { return }
        generation += 1
        aiThinking = false
        var summary = MatchSummary(match: match)
        summary.outcome = .win(ai)
        reward = app?.record(summary)
        resultRecorded = true
        resigned = true
        isPaused = false
        app?.discardSavedMatch()
        app?.sound.play(.lose)
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { showResult = true }
    }

    func requestHint() {
        guard showsHintButton, isHumanTurn, !hintLoading else { return }
        hintLoading = true
        let snapshot = state
        let gen = generation
        let task = Task { [weak self] in
            guard let self else { return }
            let move = await worker.chooseMove(for: snapshot, config: Difficulty.master.config)
            guard gen == generation, snapshot == match.state else { hintLoading = false; return }
            hintLoading = false
            withAnimation(.easeInOut) { hint = move }
            if let m = move, let a = m.ability { armedAbility = a } else { armedAbility = nil }
        }
        tasks.append(task)
    }

    func pauseForInterruption() {
        if !match.isOver && match.config.mode != .tutorial { isPaused = true }
    }

    // MARK: Tutorial flow

    func nextTutorialStep() {
        guard kind == .tutorial else { return }
        if tutorialIndex + 1 >= Tutorial.steps.count {
            tutorialFinished = true
            app?.completeTutorial()
            return
        }
        generation += 1
        tutorialIndex += 1
        tutorialPartial = []
        tutorialStepDone = false
        let step = Tutorial.steps[tutorialIndex]
        match = Match(config: match.config, initialState: step.makeState())
        events.removeAll()
        lastMoveCells = []
        entries.removeAll()
        withAnimation(.easeInOut(duration: 0.35)) {
            tracker = PieceTracker(state: match.initialState)
        }
        armedAbility = nil
    }

    // MARK: Core move handling

    private func perform(_ move: Move) {
        let player = state.toMove
        let beforeIDs = Set(tracker.placedPieces.map(\.piece.id))
        let removed = move.kind == .rift ? tracker.columns[move.column].last : nil
        let effects: MoveEffects
        do {
            effects = try match.play(move)
        } catch {
            showFeedback("Dieser Zug ist nicht erlaubt.", column: move.column, error: true)
            return
        }
        var next = tracker
        next.apply(move, by: player)
        if let newPiece = next.placedPieces.first(where: { !beforeIDs.contains($0.piece.id) }) {
            switch move.kind {
            case .geyser: entries[newPiece.piece.id] = .rise
            default: entries[newPiece.piece.id] = .fall(rows: geometry.rows - newPiece.cell.row + 1)
            }
        }
        let reduce = settings.reduceMotion
        withAnimation(reduce ? .easeOut(duration: 0.15) : .spring(response: 0.42, dampingFraction: 0.72)) {
            tracker = next
            armedAbility = nil
            hint = nil
            feedback = nil
        }
        lastMoveCells = effects.placedCell.map { [$0] } ?? []
        react(to: effects, removed: removed)
        if kind == .standard { app?.persist(match) }

        if kind == .tutorial { tutorialProgress(after: move) }
        if puzzle != nil { puzzleProgress(after: effects) }
        if match.isOver {
            finishGame(animated: true)
        } else {
            scheduleAIIfNeeded()
        }
    }

    private func react(to effects: MoveEffects, removed: Piece?) {
        guard let app else { return }
        switch effects.move.kind {
        case .drop:
            app.sound.playDrop(row: effects.placedCell?.row ?? 0)
            app.haptics.drop()
        case .anchor:
            app.sound.play(.anchor)
            app.haptics.ability()
            if let c = effects.placedCell { addEvent(.anchor(c)) }
        case .geyser:
            app.sound.play(.geyser)
            app.haptics.ability()
            addEvent(.geyser(column: effects.move.column))
        case .rift:
            app.sound.play(.rift)
            app.haptics.ability()
            if let c = effects.removedCell { addEvent(.shatter(c, removed?.owner ?? .neutral)) }
        }
        for claim in effects.crystalsClaimed {
            addEvent(.crystal(claim.cell, claim.by))
            let t = Task { @MainActor [weak app] in
                try? await Task.sleep(for: .milliseconds(180))
                app?.sound.play(.crystal)
            }
            tasks.append(t)
        }
    }

    private func addEvent(_ kind: BoardEvent.Kind) {
        let event = BoardEvent(kind: kind)
        events.append(event)
        let t = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(1.4))
            self?.events.removeAll { $0.id == event.id }
        }
        tasks.append(t)
    }

    private func scheduleAIIfNeeded() {
        guard !match.isOver, !isPaused, !puzzleFailed, !puzzleSolved, !resigned else { return }
        if kind == .tutorial { return }
        guard match.isAITurn, let ai = match.config.aiPlayer, !aiThinking else { return }
        var config = (match.config.difficulty ?? .strategist).config
        if puzzle != nil { config = AIConfig(maxDepth: 8, timeLimit: 0.8, noiseTolerance: 0, shortsightedChance: 0, abilityChance: 1) }
        aiThinking = true
        let gen = generation
        let snapshot = state
        let task = Task { [weak self] in
            let started = ContinuousClock.now
            guard let worker = self?.worker else { return }
            let move = await worker.chooseMove(for: snapshot, config: config)
            // Give the previous animation time to land so the AI never feels instant.
            let minimum: Duration = snapshot.awaitingFollowUpDrop ? .milliseconds(450) : .milliseconds(650)
            let elapsed = ContinuousClock.now - started
            if elapsed < minimum { try? await Task.sleep(for: minimum - elapsed) }
            guard let self else { return }
            while isPaused && gen == generation {
                try? await Task.sleep(for: .milliseconds(200))
            }
            guard gen == generation, snapshot == match.state, state.toMove == ai else {
                if gen == generation { aiThinking = false }
                return
            }
            aiThinking = false
            if let move { perform(move) }
        }
        tasks.append(task)
    }

    private func finishGame(animated: Bool) {
        guard let app else { return }
        if animated {
            switch state.outcome {
            case .win(let p):
                let humanLost = (match.config.aiPlayer == p) || (kind == .tutorial && p == .moon)
                app.sound.play(humanLost ? .lose : .win)
                humanLost ? app.haptics.error() : app.haptics.success()
            case .draw: app.sound.play(.draw)
            case .ongoing: break
            }
        }
        if !resultRecorded && match.config.mode.isRated {
            resultRecorded = true
            reward = app.record(MatchSummary(match: match))
        }
        if kind == .standard { app.persist(match) }
        guard kind == .standard else { return }
        let gen = generation
        let t = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(animated ? 1300 : 0))
            guard let self, gen == generation else { return }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) { showResult = true }
        }
        tasks.append(t)
    }

    private func tutorialProgress(after move: Move) {
        guard let step = tutorialStep else { return }
        tutorialPartial.append(move)
        guard step.completes(tutorialPartial) else { return }
        tutorialStepDone = true
        app?.haptics.success()
        if !match.isOver && !step.reply.isEmpty {
            let gen = generation
            let t = Task { @MainActor [weak self] in
                try? await Task.sleep(for: .milliseconds(700))
                guard let self, gen == generation else { return }
                for reply in step.reply where state.isLegal(reply) {
                    let player = state.toMove
                    let effects = try? match.play(reply)
                    withAnimation(.spring(response: 0.42, dampingFraction: 0.72)) {
                        var next = tracker
                        next.apply(reply, by: player)
                        if let piece = next.columns[reply.column].last { entries[piece.id] = .fall(rows: geometry.rows) }
                        tracker = next
                    }
                    if let e = effects { react(to: e, removed: nil) }
                }
            }
            tasks.append(t)
        }
    }

    private func puzzleProgress(after effects: MoveEffects) {
        guard let p = puzzle else { return }
        if effects.player == p.attacker && !state.awaitingFollowUpDrop { puzzleTurnsUsed += 1 }
        if case .win(let winner) = state.outcome, winner == p.attacker {
            puzzleSolved = true
            if let r = app?.recordPuzzle(p.id) { reward = r }
        } else if match.isOver {
            puzzleFailed = true
        } else if effects.player == p.attacker && !state.awaitingFollowUpDrop && puzzleTurnsUsed >= p.turns {
            puzzleFailed = true
            generation += 1
        }
    }

    // MARK: Helpers

    private func abilityKind(_ a: Ability) -> Move.Kind {
        switch a {
        case .anchor: return .anchor
        case .geyser: return .geyser
        case .rift: return .rift
        }
    }

    private func showFeedback(_ text: String, column: Int?, error: Bool) {
        if error {
            app?.sound.play(.invalid)
            app?.haptics.error()
        }
        let f = Feedback(message: text, column: column, isError: error)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { feedback = f }
        let t = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(2.2))
            guard let self, feedback?.id == f.id else { return }
            withAnimation(.easeOut) { feedback = nil }
        }
        tasks.append(t)
    }

    private func tutorialCorrection(for step: TutorialStep) -> String {
        if let ability = step.focusAbility, tutorialPartial.isEmpty, armedAbility != ability {
            return "Tippe zuerst auf „\(ability.displayName)“ und dann auf die leuchtende Spalte."
        }
        return "Probiere die leuchtende Spalte."
    }

    private func message(for violation: RuleViolation) -> String {
        switch violation {
        case .gameOver: return "Die Partie ist beendet."
        case .columnOutOfRange: return "Ungültige Spalte."
        case .columnFull: return "Diese Spalte ist voll."
        case .columnEmpty: return "Hier gibt es keinen Stein zum Entfernen."
        case .abilitiesDisabled: return "In dieser Arena gibt es keine Fähigkeiten."
        case .notEnoughEnergy(let needed, let available): return "Zu wenig Energie: \(needed) nötig, \(available) vorhanden."
        case .followUpDropRequired: return "Jetzt folgt ein normaler Wurf."
        case .boardTooFullForAnchor: return "Kein Platz mehr für Anker und Wurf."
        }
    }
}
