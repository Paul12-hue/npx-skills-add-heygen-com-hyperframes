import SwiftUI
import KaskadeCore

/// A glossy game stone. Sun stones carry a radiant ring, moon stones a crescent, neutral stones a rune.
struct StoneView: View {
    let owner: StoneOwner
    let palette: SkinPalette
    var diameter: CGFloat
    var highlighted = false
    var ghost = false

    private var colors: StonePalette {
        switch owner {
        case .sun: return palette.sun
        case .moon: return palette.moon
        case .neutral: return SkinPalette.neutral
        }
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(colors: [colors.light, colors.base, colors.deep],
                                     center: UnitPoint(x: 0.35, y: 0.3), startRadius: diameter * 0.02, endRadius: diameter * 0.62))
            Circle()
                .strokeBorder(LinearGradient(colors: [.white.opacity(0.55), .clear, .black.opacity(0.35)], startPoint: .top, endPoint: .bottom),
                              lineWidth: diameter * 0.045)
            emblem
                .frame(width: diameter * 0.46, height: diameter * 0.46)
                .opacity(0.55)
            // Specular highlight.
            Ellipse()
                .fill(LinearGradient(colors: [.white.opacity(0.75), .white.opacity(0)], startPoint: .top, endPoint: .bottom))
                .frame(width: diameter * 0.5, height: diameter * 0.26)
                .offset(x: -diameter * 0.1, y: -diameter * 0.24)
                .blur(radius: diameter * 0.02)
        }
        .frame(width: diameter, height: diameter)
        .shadow(color: colors.glow.opacity(highlighted ? 0.95 : 0.35), radius: highlighted ? diameter * 0.35 : diameter * 0.08)
        .shadow(color: .black.opacity(0.4), radius: diameter * 0.05, y: diameter * 0.05)
        .opacity(ghost ? 0.38 : 1)
        .accessibilityHidden(true)
    }

    @ViewBuilder private var emblem: some View {
        switch owner {
        case .sun:
            SunEmblem().stroke(colors.deep, style: StrokeStyle(lineWidth: diameter * 0.045, lineCap: .round))
        case .moon:
            MoonEmblem().fill(colors.deep)
        case .neutral:
            RuneEmblem().stroke(Color.white.opacity(0.7), style: StrokeStyle(lineWidth: diameter * 0.05, lineCap: .round, lineJoin: .round))
        }
    }
}

struct SunEmblem: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let r = min(rect.width, rect.height) / 2
        p.addEllipse(in: CGRect(x: c.x - r * 0.45, y: c.y - r * 0.45, width: r * 0.9, height: r * 0.9))
        for i in 0..<8 {
            let a = Double(i) * .pi / 4
            p.move(to: CGPoint(x: c.x + cos(a) * r * 0.68, y: c.y + sin(a) * r * 0.68))
            p.addLine(to: CGPoint(x: c.x + cos(a) * r * 0.98, y: c.y + sin(a) * r * 0.98))
        }
        return p
    }
}

struct MoonEmblem: Shape {
    func path(in rect: CGRect) -> Path {
        let r = min(rect.width, rect.height) / 2
        let outer = Path(ellipseIn: CGRect(x: rect.midX - r, y: rect.midY - r, width: 2 * r, height: 2 * r))
        let inner = Path(ellipseIn: CGRect(x: rect.midX - r * 0.55, y: rect.midY - r * 1.05, width: 1.8 * r, height: 1.8 * r))
        return outer.subtracting(inner)
    }
}

struct RuneEmblem: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.move(to: CGPoint(x: rect.minX + rect.width * 0.15, y: rect.minY + rect.height * 0.3))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.15, y: rect.minY + rect.height * 0.3))
        return p
    }
}

/// Animated night-canyon backdrop with slowly drifting light motes.
struct CanyonBackground: View {
    var reduceMotion = false

    var body: some View {
        ZStack {
            Theme.background
            RadialGradient(colors: [Theme.mist.opacity(0.55), .clear], center: UnitPoint(x: 0.2, y: 0.1), startRadius: 10, endRadius: 700)
            RadialGradient(colors: [Color(hex: 0x5B3A8C).opacity(0.35), .clear], center: UnitPoint(x: 0.9, y: 0.85), startRadius: 10, endRadius: 650)
            CanyonRidges()
                .fill(LinearGradient(colors: [Color(hex: 0x0B1230), Color(hex: 0x050811)], startPoint: .top, endPoint: .bottom))
                .opacity(0.9)
            if reduceMotion {
                MotesView(time: 0)
            } else {
                TimelineView(.animation(minimumInterval: 1 / 30)) { context in
                    MotesView(time: context.date.timeIntervalSinceReferenceDate)
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

private struct CanyonRidges: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.maxY))
        let points: [(CGFloat, CGFloat)] = [(0, 0.78), (0.12, 0.72), (0.22, 0.8), (0.35, 0.7), (0.5, 0.82), (0.63, 0.74),
                                            (0.76, 0.84), (0.88, 0.73), (1, 0.79)]
        for (x, y) in points { p.addLine(to: CGPoint(x: rect.width * x, y: rect.height * y)) }
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

private struct MotesView: View {
    let time: Double

    var body: some View {
        Canvas { ctx, size in
            for i in 0..<38 {
                let seed = Double(i) * 12.9898
                let baseX = (sin(seed) * 43758.5453).truncatingRemainder(dividingBy: 1)
                let speed = 0.008 + 0.012 * abs(cos(seed * 1.7))
                let y = (1.1 - (time * speed + abs(sin(seed * 3.1))).truncatingRemainder(dividingBy: 1.2))
                let x = abs(baseX) + 0.02 * sin(time * 0.3 + seed)
                let r = 1.2 + 2.2 * abs(sin(seed * 5.3))
                let alpha = 0.15 + 0.35 * abs(sin(time * 0.5 + seed))
                let rect = CGRect(x: x * size.width, y: y * size.height, width: r, height: r)
                let color = i % 3 == 0 ? Theme.crystal : (i % 3 == 1 ? Color(hex: 0xFFD08A) : .white)
                ctx.fill(Path(ellipseIn: rect), with: .color(color.opacity(alpha)))
            }
        }
    }
}
