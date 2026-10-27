import SwiftUI

struct BoardView: View {
    let boxes: [Box]
    @Binding var selection: UUID?
    @Binding var filterRaw: String
    let onAdd: () -> Void

    private static let filterKeys = ["active", "terminal", "out", "empty", "returned"]
    private static let filterTitles = ["active": "Active", "terminal": "Terminal", "out": "Out", "empty": "Empty", "returned": "Returned"]

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let now = context.date
            let ranked = rank(now: now)
            List(selection: $selection) {
                Section {
                    TotalsStrip(boxes: boxes, now: now)
                    NextMoveCard(top: ranked.first(where: { $0.box.status != .returned }), now: now) { id in selection = id }
                }
                .listRowSeparator(.hidden)

                Section {
                    Picker("Filter", selection: $filterRaw) {
                        ForEach(Self.filterKeys, id: \.self) { key in Text(Self.filterTitles[key] ?? key).tag(key) }
                    }
                    .pickerStyle(.segmented)
                    .listRowSeparator(.hidden)

                    let visible = ranked.filter { matches($0.box) }
                    if visible.isEmpty {
                        Text("No containers in this view.").foregroundStyle(.secondary)
                    }
                    ForEach(visible) { item in
                        BoxRow(box: item.box, assessment: item.assessment)
                            .tag(item.box.id)
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
        .navigationTitle("DrayDesk")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(action: onAdd) { Label("Add container", systemImage: "plus") }
            }
        }
    }

    private func rank(now: Date) -> [Ranked] {
        boxes.map { Ranked(box: $0, assessment: Fees.assess($0, now: now)) }
            .sorted { $0.assessment.score > $1.assessment.score }
    }

    private func matches(_ box: Box) -> Bool {
        filterRaw == "active" ? box.status != .returned : box.status.rawValue == filterRaw
    }
}

struct Ranked: Identifiable {
    let box: Box
    let assessment: Assessment
    var id: UUID { box.id }
}

struct TotalsStrip: View {
    let boxes: [Box]
    let now: Date

    var body: some View {
        let active = boxes.filter { $0.status != .returned }.map { Fees.assess($0, now: now) }
        let bleeding = active.reduce(0) { $0 + $1.bleedingPerDay }
        let owed = active.reduce(0) { $0 + $1.accrued }
        let soon = active.compactMap(\.primary).filter { !$0.isLate && $0.secondsLeft < 48 * 3600 }.reduce(0) { $0 + $1.rate }
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { tiles(bleeding, owed, soon) }
            VStack(spacing: 8) { tiles(bleeding, owed, soon) }
        }
    }

    @ViewBuilder
    private func tiles(_ bleeding: Double, _ owed: Double, _ soon: Double) -> some View {
        Tile(value: Fees.money(bleeding), label: "per day now", hot: bleeding > 0)
        Tile(value: Fees.money(owed), label: "owed so far", hot: owed > 0)
        Tile(value: Fees.money(soon), label: "/day at risk 48h", hot: false)
    }

    struct Tile: View {
        let value: String
        let label: String
        let hot: Bool
        var body: some View {
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(.title3, design: .monospaced).weight(.semibold))
                    .foregroundStyle(hot ? Color.red : Color.primary)
                    .minimumScaleFactor(0.7).lineLimit(1)
                Text(label.uppercased()).font(.caption2).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 10))
        }
    }
}

struct NextMoveCard: View {
    let top: Ranked?
    let now: Date
    let open: (UUID) -> Void

    var body: some View {
        if let top {
            card(top.box, top.assessment)
        } else {
            Text("Nothing on the clock. Add a container to start.").foregroundStyle(.secondary)
        }
    }

    private func card(_ box: Box, _ a: Assessment) -> some View {
            Button { open(box.id) } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("NEXT MOVE").font(.caption.weight(.bold)).foregroundStyle(.orange)
                    Text(box.number.isEmpty ? "New container" : box.number)
                        .font(.system(.title, design: .monospaced).weight(.semibold))
                    Text(Fees.nextAction(box)).font(.subheadline)
                    Text(clockLine(a)).font(.system(.footnote, design: .monospaced))
                        .foregroundStyle(a.level == .hot ? Color.red : Color.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(.background, in: RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.primary, lineWidth: 2))
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.orange).offset(x: 5, y: 5))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 6)
    }

    private func clockLine(_ a: Assessment) -> String {
        guard let p = a.primary else { return "Dates missing. Add Last Free Day or return date." }
        let owed = a.accrued > 0 ? " Owed \(Fees.money(a.accrued))." : ""
        if p.isLate { return "\(p.title) passed \(Fees.duration(p.secondsLeft)) ago. \(Fees.money(p.rate))/day.\(owed)" }
        return "\(p.title) in \(Fees.duration(p.secondsLeft)). Then \(Fees.money(p.rate))/day.\(owed)"
    }
}

struct BoxRow: View {
    let box: Box
    let assessment: Assessment

    private var color: Color {
        switch assessment.level {
        case .hot: .red
        case .warn: .orange
        case .ok: .green
        case .done: .gray
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(box.number.isEmpty ? "New container" : box.number)
                    .font(.system(.body, design: .monospaced).weight(.semibold))
                Text([box.status.title, box.line, box.terminal].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                if box.status == .returned {
                    Text("Done").font(.system(.subheadline, design: .monospaced))
                } else if let p = assessment.primary {
                    Text(p.isLate ? "-\(Fees.duration(p.secondsLeft))" : Fees.duration(p.secondsLeft))
                        .font(.system(.subheadline, design: .monospaced).weight(.semibold))
                        .foregroundStyle(color)
                    Text(p.isLate ? "\(Fees.money(p.rate))/day" : (p.kind == .demurrage ? "to LFD" : "to return"))
                        .font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
                } else {
                    Text("No date").font(.system(.subheadline, design: .monospaced)).foregroundStyle(.orange)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
