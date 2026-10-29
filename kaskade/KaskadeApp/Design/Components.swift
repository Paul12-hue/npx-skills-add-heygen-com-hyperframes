import SwiftUI
import KaskadeCore

// MARK: Surfaces

struct GlassPanel: ViewModifier {
    var cornerRadius: CGFloat = 24
    var highlighted: Color? = nil

    func body(content: Content) -> some View {
        content
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial.opacity(0.55))
                    .background(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).fill(Theme.glass))
            }
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(highlighted ?? Theme.hairline, lineWidth: highlighted == nil ? 1 : 2)
            }
            .shadow(color: (highlighted ?? .black).opacity(highlighted == nil ? 0.35 : 0.45), radius: highlighted == nil ? 18 : 22, y: 8)
    }
}

extension View {
    func glassPanel(cornerRadius: CGFloat = 24, highlighted: Color? = nil) -> some View {
        modifier(GlassPanel(cornerRadius: cornerRadius, highlighted: highlighted))
    }
}

// MARK: Buttons

struct PrimaryButtonStyle: ButtonStyle {
    var tint: Color = Color(hex: 0xFFA733)
    var tintDeep: Color = Color(hex: 0xE0531F)

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.heading(20))
            .foregroundStyle(Color(hex: 0x24140A))
            .padding(.horizontal, 28)
            .frame(minHeight: 60)
            .background {
                Capsule().fill(LinearGradient(colors: [tint, tintDeep], startPoint: .top, endPoint: .bottom))
                    .overlay(Capsule().strokeBorder(.white.opacity(0.45), lineWidth: 1).blendMode(.overlay))
            }
            .shadow(color: tint.opacity(configuration.isPressed ? 0.2 : 0.45), radius: configuration.isPressed ? 6 : 16, y: 6)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.heading(18))
            .foregroundStyle(Theme.textPrimary)
            .padding(.horizontal, 22)
            .frame(minHeight: 56)
            .background(Capsule().fill(Theme.glassStrong))
            .overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// Round icon button for toolbars (≥ 52 pt touch target).
struct IconButton: View {
    let systemName: String
    let label: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(enabled ? Theme.textPrimary : Theme.textMuted)
                .frame(width: 56, height: 56)
                .background(Circle().fill(Theme.glassStrong))
                .overlay(Circle().strokeBorder(Theme.hairline, lineWidth: 1))
        }
        .buttonStyle(PressScaleStyle())
        .disabled(!enabled)
        .accessibilityLabel(label)
    }
}

struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(.spring(response: 0.22, dampingFraction: 0.65), value: configuration.isPressed)
    }
}

// MARK: Shapes and icons

/// Faceted crystal outline (elongated octahedron seen from the front).
struct CrystalShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width, h = rect.height
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.minX + w * 0.9, y: rect.minY + h * 0.38))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX + w * 0.1, y: rect.minY + h * 0.38))
        p.closeSubpath()
        return p
    }
}

struct CrystalFacets: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width, h = rect.height
        p.move(to: CGPoint(x: rect.minX + w * 0.1, y: rect.minY + h * 0.38))
        p.addLine(to: CGPoint(x: rect.minX + w * 0.9, y: rect.minY + h * 0.38))
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.minX + w * 0.36, y: rect.minY + h * 0.38))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.minX + w * 0.64, y: rect.minY + h * 0.38))
        p.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        return p
    }
}

struct CrystalGlyph: View {
    var size: CGFloat
    var glowing = true

    var body: some View {
        ZStack {
            CrystalShape()
                .fill(LinearGradient(colors: [.white, Theme.crystal, Theme.crystalDeep], startPoint: .top, endPoint: .bottom))
            CrystalFacets()
                .stroke(.white.opacity(0.55), lineWidth: max(0.8, size * 0.03))
        }
        .frame(width: size * 0.62, height: size)
        .shadow(color: Theme.crystal.opacity(glowing ? 0.8 : 0), radius: size * 0.25)
    }
}

/// Custom ability icons drawn in code, so the game has its own iconography.
struct AbilityIcon: View {
    let ability: Ability
    var size: CGFloat = 28
    var color: Color = Theme.textPrimary

    var body: some View {
        Canvas { ctx, sz in
            let r = CGRect(origin: .zero, size: sz)
            let lw = sz.width * 0.1
            switch ability {
            case .anchor:
                // Hexagonal block with a horizontal keel line.
                var hex = Path()
                for i in 0..<6 {
                    let a = Double(i) * .pi / 3 + .pi / 6
                    let pt = CGPoint(x: r.midX + cos(a) * r.width * 0.42, y: r.midY + sin(a) * r.height * 0.42)
                    if i == 0 { hex.move(to: pt) } else { hex.addLine(to: pt) }
                }
                hex.closeSubpath()
                ctx.stroke(hex, with: .color(color), style: StrokeStyle(lineWidth: lw, lineJoin: .round))
                var keel = Path()
                keel.move(to: CGPoint(x: r.width * 0.3, y: r.midY))
                keel.addLine(to: CGPoint(x: r.width * 0.7, y: r.midY))
                ctx.stroke(keel, with: .color(color), style: StrokeStyle(lineWidth: lw, lineCap: .round))
            case .geyser:
                // Three rising chevrons above a base line.
                for i in 0..<2 {
                    var chev = Path()
                    let y = r.height * (0.42 + Double(i) * 0.24)
                    chev.move(to: CGPoint(x: r.width * 0.22, y: y + r.height * 0.14))
                    chev.addLine(to: CGPoint(x: r.midX, y: y - r.height * 0.06))
                    chev.addLine(to: CGPoint(x: r.width * 0.78, y: y + r.height * 0.14))
                    ctx.stroke(chev, with: .color(color.opacity(i == 0 ? 1 : 0.6)), style: StrokeStyle(lineWidth: lw, lineCap: .round, lineJoin: .round))
                }
                let dot = Path(ellipseIn: CGRect(x: r.midX - lw * 1.1, y: r.height * 0.08, width: lw * 2.2, height: lw * 2.2))
                ctx.fill(dot, with: .color(color))
            case .rift:
                // Lightning crack splitting a circle.
                let circle = Path(ellipseIn: r.insetBy(dx: r.width * 0.12, dy: r.height * 0.12))
                ctx.stroke(circle, with: .color(color.opacity(0.55)), style: StrokeStyle(lineWidth: lw * 0.8))
                var crack = Path()
                crack.move(to: CGPoint(x: r.width * 0.58, y: r.height * 0.05))
                crack.addLine(to: CGPoint(x: r.width * 0.4, y: r.height * 0.45))
                crack.addLine(to: CGPoint(x: r.width * 0.6, y: r.height * 0.52))
                crack.addLine(to: CGPoint(x: r.width * 0.42, y: r.height * 0.95))
                ctx.stroke(crack, with: .color(color), style: StrokeStyle(lineWidth: lw, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Energy meter: up to `max` segments.
struct EnergyMeter: View {
    let energy: Int
    let max: Int
    var compact = false

    var body: some View {
        HStack(spacing: compact ? 4 : 6) {
            ForEach(0..<max, id: \.self) { i in
                Capsule()
                    .fill(i < energy
                          ? AnyShapeStyle(LinearGradient(colors: [Theme.energy, Color(hex: 0xFFB300)], startPoint: .top, endPoint: .bottom))
                          : AnyShapeStyle(Color.white.opacity(0.1)))
                    .overlay(Capsule().strokeBorder(.white.opacity(i < energy ? 0.5 : 0.15), lineWidth: 1))
                    .frame(width: compact ? 18 : 30, height: compact ? 8 : 12)
                    .shadow(color: Theme.energy.opacity(i < energy ? 0.7 : 0), radius: 6)
                    .animation(.spring(response: 0.4, dampingFraction: 0.6).delay(Double(i) * 0.05), value: energy)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Energie \(energy) von \(max)")
    }
}

/// Small pips showing an ability's cost.
struct CostPips: View {
    let cost: Int
    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<cost, id: \.self) { _ in
                Circle().fill(Theme.energy).frame(width: 6, height: 6)
            }
        }
    }
}

// MARK: Wordmark

struct Wordmark: View {
    var size: CGFloat = 72

    var body: some View {
        Text("KASKADE")
            .font(.system(size: size, weight: .black, design: .rounded))
            .tracking(size * 0.12)
            .foregroundStyle(
                LinearGradient(colors: [Color(hex: 0xFFE2A8), Color(hex: 0xFFA733), Color(hex: 0x7CE7FF), Color(hex: 0x5C6CFF)],
                               startPoint: .leading, endPoint: .trailing))
            .shadow(color: Color(hex: 0xFFA733).opacity(0.35), radius: size * 0.3)
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: Section header

struct SectionTitle: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(Theme.label(13))
            .tracking(2)
            .foregroundStyle(Theme.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Top bar with back button and title, used by secondary screens.
struct ScreenHeader: View {
    let title: String
    let onBack: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            IconButton(systemName: "chevron.left", label: "Zurück", action: onBack)
            Text(title)
                .font(Theme.title(34))
                .foregroundStyle(Theme.textPrimary)
            Spacer()
        }
    }
}
