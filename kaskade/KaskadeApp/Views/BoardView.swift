import SwiftUI
import KaskadeCore

/// The interactive board. One drag gesture covers the whole board: touching previews the
/// landing cell, lifting the finger plays the move. Sliding off the board cancels.
struct BoardView: View {
    let controller: GameController
    @State private var hoverColumn: Int?
    @State private var accessibilityColumn = 3
    @State private var shake: CGFloat = 0

    private var geometry: Geometry { controller.geometry }

    var body: some View {
        GeometryReader { proxy in
            let layout = BoardLayout(size: proxy.size, columns: geometry.columns, rows: geometry.rows)
            ZStack(alignment: .topLeading) {
                boardSlab(layout)
                columnHighlights(layout)
                crystals(layout)
                pieces(layout)
                markers(layout)
                effects(layout)
                preview(layout)
            }
            .frame(width: layout.totalSize.width, height: layout.totalSize.height)
            .modifier(ShakeEffect(travel: shake))
            .position(x: proxy.size.width / 2, y: proxy.size.height / 2)
            .contentShape(Rectangle())
            .gesture(dragGesture(layout, in: proxy.size))
            .onChange(of: controller.feedback?.id) { _, _ in
                guard controller.feedback?.isError == true, !controller.settings.reduceMotion else { return }
                withAnimation(.linear(duration: 0.4)) { shake += 1 }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("board")
        .accessibilityLabel("Spielbrett")
        .accessibilityValue(accessibilitySummary)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: accessibilityColumn = min(geometry.columns - 1, accessibilityColumn + 1)
            case .decrement: accessibilityColumn = max(0, accessibilityColumn - 1)
            @unknown default: break
            }
        }
        .accessibilityAction(named: "Hier werfen") { controller.tapColumn(accessibilityColumn) }
    }

    private var accessibilitySummary: String {
        let s = controller.state
        return "Ausgewählte Spalte \(accessibilityColumn + 1), Höhe \(s.height(of: accessibilityColumn)) von \(geometry.rows). \(controller.statusText)"
    }

    // MARK: Gesture

    private func dragGesture(_ layout: BoardLayout, in container: CGSize) -> some Gesture {
        let originX = (container.width - layout.totalSize.width) / 2
        return DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                let col = layout.column(atX: value.location.x - originX)
                if col != hoverColumn {
                    withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) { hoverColumn = col }
                }
            }
            .onEnded { value in
                let col = layout.column(atX: value.location.x - originX)
                withAnimation(.easeOut(duration: 0.15)) { hoverColumn = nil }
                if let col { controller.tapColumn(col) }
            }
    }

    // MARK: Layers

    private func boardSlab(_ layout: BoardLayout) -> some View {
        let frame = layout.boardFrame
        return ZStack {
            RoundedRectangle(cornerRadius: layout.cell * 0.36, style: .continuous)
                .fill(LinearGradient(colors: [Color(hex: 0x24306A), Color(hex: 0x141C42), Color(hex: 0x0C1230)],
                                     startPoint: .top, endPoint: .bottom))
            RoundedRectangle(cornerRadius: layout.cell * 0.36, style: .continuous)
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.35), .white.opacity(0.05), Theme.crystal.opacity(0.25)],
                                             startPoint: .top, endPoint: .bottom), lineWidth: 2)
            Canvas { ctx, _ in
                for c in 0..<geometry.columns {
                    for r in 0..<geometry.rows {
                        let center = layout.localCenter(Cell(c, r))
                        let d = layout.stoneDiameter * 1.04
                        let rect = CGRect(x: center.x - d / 2, y: center.y - d / 2, width: d, height: d)
                        ctx.fill(Path(ellipseIn: rect), with: .radialGradient(
                            Gradient(colors: [Color(hex: 0x060915), Color(hex: 0x0B1128), Color(hex: 0x1A2556)]),
                            center: CGPoint(x: rect.midX, y: rect.minY + d * 0.35), startRadius: 0, endRadius: d * 0.62))
                        ctx.stroke(Path(ellipseIn: rect), with: .color(.white.opacity(0.06)), lineWidth: 1)
                    }
                }
            }
        }
        .frame(width: frame.width, height: frame.height)
        .shadow(color: .black.opacity(0.55), radius: 30, y: 18)
        .offset(x: frame.minX, y: frame.minY)
    }

    private func columnHighlights(_ layout: BoardLayout) -> some View {
        let legal = controller.legalColumns
        let armed = controller.armedAbility != nil || controller.tutorialStep.map { !$0.allowedTurns.isEmpty } == true
        let errorColumn = controller.feedback?.isError == true ? controller.feedback?.column : nil
        return ForEach(0..<geometry.columns, id: \.self) { c in
            let rect = layout.columnRect(c)
            let isHover = hoverColumn == c && controller.isHumanTurn
            let isHint = controller.hint?.column == c
            let color: Color = errorColumn == c ? Theme.danger
                : isHint ? Theme.energy
                : (controller.armedAbility == nil ? Color.white : Theme.crystal)
            let opacity: Double = errorColumn == c ? 0.28
                : isHint ? 0.22
                : isHover && legal.contains(c) ? 0.16
                : armed && legal.contains(c) ? 0.12 : 0
            RoundedRectangle(cornerRadius: layout.cell * 0.3, style: .continuous)
                .fill(color.opacity(opacity))
                .overlay(RoundedRectangle(cornerRadius: layout.cell * 0.3, style: .continuous)
                    .strokeBorder(color.opacity(opacity * 2.2), lineWidth: 1.5))
                .frame(width: rect.width, height: rect.height)
                .offset(x: rect.minX, y: rect.minY)
                .allowsHitTesting(false)
                .animation(.easeInOut(duration: 0.2), value: opacity)
        }
    }

    private func crystals(_ layout: BoardLayout) -> some View {
        let cells = geometry.cells(in: controller.state.crystals)
        return ForEach(cells, id: \.self) { cell in
            FloatingCrystal(size: layout.stoneDiameter * 0.62, reduceMotion: controller.settings.reduceMotion)
                .position(layout.localCenter(cell))
                .transition(.scale(scale: 1.8).combined(with: .opacity))
        }
    }

    private func pieces(_ layout: BoardLayout) -> some View {
        let winning = Set(controller.state.winningCells)
        return ForEach(controller.tracker.placedPieces, id: \.piece.id) { item in
            EnteringStone(owner: item.piece.owner, palette: controller.palette, diameter: layout.stoneDiameter,
                          highlighted: winning.contains(item.cell), entry: controller.entries[item.piece.id],
                          cell: layout.cell, reduceMotion: controller.settings.reduceMotion)
                .position(layout.localCenter(item.cell))
                .transition(.asymmetric(insertion: .identity, removal: .scale(scale: 1.5).combined(with: .opacity)))
                .zIndex(1)
        }
    }

    private func markers(_ layout: BoardLayout) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(Array(controller.lastMoveCells), id: \.self) { cell in
                Circle()
                    .strokeBorder(.white.opacity(0.7), lineWidth: 2)
                    .frame(width: layout.stoneDiameter * 0.28, height: layout.stoneDiameter * 0.28)
                    .position(layout.localCenter(cell))
            }
            ForEach(controller.state.winningCells, id: \.self) { cell in
                WinPulse(diameter: layout.stoneDiameter)
                    .position(layout.localCenter(cell))
            }
        }
        .allowsHitTesting(false)
        .zIndex(2)
    }

    private func effects(_ layout: BoardLayout) -> some View {
        ForEach(controller.events) { event in
            switch event.kind {
            case .crystal(let cell, let player):
                CrystalBurst(size: layout.cell, color: player.map { controller.palette.palette(for: $0).glow } ?? .white)
                    .position(layout.localCenter(cell))
            case .shatter(let cell, let owner):
                ShatterBurst(size: layout.cell, color: owner.player.map { controller.palette.palette(for: $0).base } ?? SkinPalette.neutral.base)
                    .position(layout.localCenter(cell))
            case .geyser(let column):
                let rect = layout.columnRect(column)
                GeyserJet(width: rect.width, height: rect.height)
                    .frame(width: rect.width, height: rect.height)
                    .offset(x: rect.minX, y: rect.minY)
            case .anchor(let cell):
                DustRing(size: layout.cell)
                    .position(layout.localCenter(cell))
            }
        }
        .allowsHitTesting(false)
        .zIndex(3)
    }

    /// Ghost stone above the hovered column plus a marker where the action will land.
    @ViewBuilder private func preview(_ layout: BoardLayout) -> some View {
        if let c = hoverColumn ?? controller.hint?.column, controller.isHumanTurn {
            let s = controller.state
            let h = s.height(of: c)
            let legal = controller.legalColumns.contains(c)
            let ability = controller.armedAbility ?? controller.hint?.ability
            let owner: StoneOwner = ability == .anchor ? .neutral : StoneOwner(s.toMove)
            ZStack(alignment: .topLeading) {
                StoneView(owner: owner, palette: controller.palette, diameter: layout.stoneDiameter * 0.9)
                    .opacity(legal ? 1 : 0.35)
                    .position(layout.laneCenter(c))
                if legal && controller.settings.showColumnHints {
                    switch ability {
                    case .geyser:
                        AbilityIcon(ability: .geyser, size: layout.stoneDiameter * 0.55, color: Theme.crystal)
                            .position(layout.localCenter(Cell(c, 0)))
                    case .rift:
                        AbilityIcon(ability: .rift, size: layout.stoneDiameter * 0.6, color: Theme.danger)
                            .position(layout.localCenter(Cell(c, max(0, h - 1))))
                    default:
                        if h < geometry.rows {
                            StoneView(owner: owner, palette: controller.palette, diameter: layout.stoneDiameter, ghost: true)
                                .position(layout.localCenter(Cell(c, h)))
                        }
                    }
                }
            }
            .allowsHitTesting(false)
            .zIndex(4)
        }
    }
}

/// Converts between board cells and points. Leaves one lane above the board for the preview stone.
struct BoardLayout {
    let columns: Int
    let rows: Int
    let cell: CGFloat
    let padding: CGFloat
    let lane: CGFloat

    init(size: CGSize, columns: Int, rows: Int) {
        self.columns = columns
        self.rows = rows
        let laneFactor: CGFloat = 1.0
        let padFactor: CGFloat = 0.3
        let byWidth = size.width / (CGFloat(columns) + 2 * padFactor)
        let byHeight = size.height / (CGFloat(rows) + 2 * padFactor + laneFactor)
        cell = max(10, min(byWidth, byHeight))
        padding = cell * padFactor
        lane = cell * laneFactor
    }

    var stoneDiameter: CGFloat { cell * 0.84 }

    var boardFrame: CGRect {
        CGRect(x: 0, y: lane, width: CGFloat(columns) * cell + 2 * padding, height: CGFloat(rows) * cell + 2 * padding)
    }

    var totalSize: CGSize { CGSize(width: boardFrame.width, height: boardFrame.maxY) }

    func localCenter(_ cell: Cell) -> CGPoint {
        CGPoint(x: padding + (CGFloat(cell.column) + 0.5) * self.cell,
                y: lane + padding + (CGFloat(rows - 1 - cell.row) + 0.5) * self.cell)
    }

    func laneCenter(_ column: Int) -> CGPoint {
        CGPoint(x: padding + (CGFloat(column) + 0.5) * cell, y: lane * 0.5)
    }

    func columnRect(_ column: Int) -> CGRect {
        CGRect(x: padding + CGFloat(column) * cell + cell * 0.04, y: lane + padding * 0.5,
               width: cell * 0.92, height: CGFloat(rows) * cell + padding)
    }

    /// Column under a horizontal position, nil when outside the board.
    func column(atX x: CGFloat) -> Int? {
        let inner = x - padding
        guard x >= 0, x <= totalSize.width else { return nil }
        return min(columns - 1, max(0, Int(inner / cell)))
    }
}

// MARK: Animated pieces

/// A stone that animates in on first appearance: falling from above or rising from below.
private struct EnteringStone: View {
    let owner: StoneOwner
    let palette: SkinPalette
    let diameter: CGFloat
    let highlighted: Bool
    let entry: StoneEntry?
    let cell: CGFloat
    let reduceMotion: Bool
    @State private var landed = false

    var body: some View {
        StoneView(owner: owner, palette: palette, diameter: diameter, highlighted: highlighted)
            .offset(y: landed ? 0 : startOffset)
            .opacity(landed || entry != .rise ? 1 : 0)
            .scaleEffect(highlighted ? 1.06 : 1)
            .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: highlighted)
            .onAppear {
                guard entry != nil, !landed else { landed = true; return }
                if reduceMotion {
                    landed = true
                } else if entry == .rise {
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { landed = true }
                } else {
                    withAnimation(.interpolatingSpring(stiffness: 210, damping: 17)) { landed = true }
                }
            }
    }

    private var startOffset: CGFloat {
        switch entry {
        case .fall(let rows): return -CGFloat(rows) * cell
        case .rise: return cell * 0.9
        case nil: return 0
        }
    }
}

private struct FloatingCrystal: View {
    let size: CGFloat
    let reduceMotion: Bool
    @State private var up = false

    var body: some View {
        CrystalGlyph(size: size)
            .offset(y: up ? -size * 0.08 : size * 0.08)
            .rotation3DEffect(.degrees(up ? 12 : -12), axis: (x: 0, y: 1, z: 0))
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { up = true }
            }
            .allowsHitTesting(false)
    }
}

private struct WinPulse: View {
    let diameter: CGFloat
    @State private var on = false

    var body: some View {
        Circle()
            .strokeBorder(Theme.energy, lineWidth: 3)
            .frame(width: diameter * 1.08, height: diameter * 1.08)
            .scaleEffect(on ? 1.18 : 0.96)
            .opacity(on ? 0.2 : 0.95)
            .onAppear {
                withAnimation(.easeOut(duration: 0.9).repeatForever(autoreverses: false)) { on = true }
            }
    }
}

// MARK: Effects

/// Drives an effect from 0 to 1 once.
private struct OneShot<Content: View>: View {
    let duration: Double
    @ViewBuilder let content: (Double) -> Content
    @State private var progress = 0.0

    var body: some View {
        content(progress)
            .onAppear { withAnimation(.easeOut(duration: duration)) { progress = 1 } }
    }
}

private struct CrystalBurst: View {
    let size: CGFloat
    let color: Color

    var body: some View {
        OneShot(duration: 0.9) { p in
            ZStack {
                Circle()
                    .strokeBorder(Theme.crystal, lineWidth: 3)
                    .frame(width: size * (0.4 + 1.2 * p), height: size * (0.4 + 1.2 * p))
                    .opacity(1 - p)
                ForEach(0..<8, id: \.self) { i in
                    let angle = Double(i) / 8 * 2 * .pi
                    CrystalGlyph(size: size * 0.22, glowing: true)
                        .offset(x: cos(angle) * size * 0.9 * p, y: sin(angle) * size * 0.9 * p - size * 0.4 * p)
                        .opacity(1 - p)
                }
                Text("+1")
                    .font(Theme.title(size * 0.32))
                    .foregroundStyle(Theme.energy)
                    .shadow(color: color, radius: 8)
                    .offset(y: -size * 0.7 * p)
                    .opacity(1 - p * p)
            }
        }
    }
}

private struct ShatterBurst: View {
    let size: CGFloat
    let color: Color

    var body: some View {
        OneShot(duration: 0.8) { p in
            ZStack {
                ForEach(0..<10, id: \.self) { i in
                    let angle = Double(i) / 10 * 2 * .pi + 0.3
                    Triangle()
                        .fill(color)
                        .frame(width: size * 0.16, height: size * 0.2)
                        .rotationEffect(.degrees(360 * p + Double(i) * 36))
                        .offset(x: cos(angle) * size * 0.8 * p, y: sin(angle) * size * 0.8 * p + size * 0.6 * p * p)
                        .opacity(1 - p)
                }
                AbilityIcon(ability: .rift, size: size * 0.7, color: .white)
                    .opacity(1 - p)
                    .scaleEffect(1 + p * 0.4)
            }
        }
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

private struct GeyserJet: View {
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        OneShot(duration: 0.9) { p in
            RoundedRectangle(cornerRadius: width * 0.4, style: .continuous)
                .fill(LinearGradient(colors: [Theme.crystal.opacity(0.0), Theme.crystal.opacity(0.55), .white.opacity(0.7)],
                                     startPoint: .top, endPoint: .bottom))
                .frame(width: width * 0.7, height: height * min(1, p * 1.6))
                .frame(width: width, height: height, alignment: .bottom)
                .opacity(1 - p)
                .blur(radius: 4)
        }
    }
}

private struct DustRing: View {
    let size: CGFloat

    var body: some View {
        OneShot(duration: 0.7) { p in
            Ellipse()
                .strokeBorder(SkinPalette.neutral.light, lineWidth: 3)
                .frame(width: size * (0.6 + 0.9 * p), height: size * (0.3 + 0.4 * p))
                .offset(y: size * 0.3)
                .opacity(1 - p)
        }
    }
}

struct ShakeEffect: GeometryEffect {
    var travel: CGFloat
    var animatableData: CGFloat {
        get { travel }
        set { travel = newValue }
    }

    func effectValue(size: CGSize) -> ProjectionTransform {
        ProjectionTransform(CGAffineTransform(translationX: 8 * sin(travel * .pi * 6), y: 0))
    }
}
