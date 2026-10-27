import SwiftUI

struct DetailView: View {
    @Bindable var box: Box
    let onDelete: () -> Void
    @Environment(\.horizontalSizeClass) private var hSize
    @State private var confirmDelete = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let a = Fees.assess(box, now: context.date)
            Form {
                Section {
                    clockCards(a, now: context.date)
                        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    Text(Fees.nextAction(box)).font(.subheadline)
                    stepButtons
                } header: {
                    Text(box.status.title)
                }

                Section("Container") {
                    VStack(alignment: .leading, spacing: 4) {
                        TextField("MSCU1234566", text: Binding(
                            get: { box.number },
                            set: { box.number = ContainerNumber.normalize($0) }
                        ))
                        .font(.system(.body, design: .monospaced))
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        if !box.number.isEmpty {
                            let problem = ContainerNumber.problem(box.number)
                            Text(problem ?? "Check digit valid")
                                .font(.caption)
                                .foregroundStyle(problem == nil ? Color.green : Color.red)
                        }
                    }
                    Picker("Status", selection: Binding(get: { box.status }, set: { box.status = $0 })) {
                        ForEach(BoxStatus.allCases) { Text($0.title).tag($0) }
                    }
                    TextField("Steamship line", text: $box.line)
                    TextField("Terminal", text: $box.terminal)
                    TextField("Customer / delivery", text: $box.customer)
                }

                Section("Demurrage (terminal)") {
                    OptionalDateRow(title: "Last Free Day", date: $box.lastFreeDay, components: .date)
                    OptionalDateRow(title: "Appointment", date: $box.appointment, components: [.date, .hourAndMinute])
                    MoneyField(title: "Per day", value: $box.demurrageRate)
                    Stepper("Tier 2 after \(box.demurrageStepDays) late days", value: $box.demurrageStepDays, in: 0...30)
                    MoneyField(title: "Tier 2 per day", value: $box.demurrageRate2)
                }

                Section("Per diem (steamship line)") {
                    OptionalDateRow(title: "Empty return by", date: $box.returnBy, components: .date)
                    MoneyField(title: "Per day", value: $box.perDiemRate)
                    TextField("Return empty to", text: $box.returnTo)
                }

                Section("Notes") {
                    TextField("Notes", text: $box.notes, axis: .vertical).lineLimit(2...6)
                }

                Section {
                    Button("Delete container", role: .destructive) { confirmDelete = true }
                }
            }
        }
        .navigationTitle(box.number.isEmpty ? "New container" : box.number)
        .navigationBarTitleDisplayMode(hSize == .regular ? .large : .inline)
        .confirmationDialog("Delete \(box.number.isEmpty ? "this container" : box.number)?", isPresented: $confirmDelete) {
            Button("Delete", role: .destructive, action: onDelete)
        }
    }

    @ViewBuilder
    private func clockCards(_ a: Assessment, now: Date) -> some View {
        // Side by side when the pane is wide (Duo unfolded), stacked when folded.
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 10) { cards(a, now: now) }
            VStack(spacing: 10) { cards(a, now: now) }
        }
    }

    @ViewBuilder
    private func cards(_ a: Assessment, now: Date) -> some View {
        let dem = a.clocks.first { $0.kind == .demurrage }
        let pd = a.clocks.first { $0.kind == .perDiem }
        ClockCard(title: "Demurrage", subtitle: box.lastFreeDay.map { "LFD \($0.formatted(date: .abbreviated, time: .omitted))" } ?? "No LFD",
                  clock: dem, offText: box.status == .terminal ? "Set Last Free Day" : "Off the terminal")
        ClockCard(title: "Per diem", subtitle: box.returnBy.map { "Return \($0.formatted(date: .abbreviated, time: .omitted))" } ?? "No return date",
                  clock: pd, offText: box.status == .terminal ? "Starts when you pull it" : box.status == .returned ? "Returned" : "Set return-by date")
        if let appt = box.appointment {
            VStack(alignment: .leading, spacing: 4) {
                Text("APPOINTMENT").font(.caption2).foregroundStyle(.secondary)
                Text(appt.formatted(date: .abbreviated, time: .shortened)).font(.system(.headline, design: .monospaced))
                Text(appt < now ? "Passed" : "In \(Fees.duration(appt.timeIntervalSince(now)))").font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
            .padding(12)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 10))
        }
    }

    @ViewBuilder
    private var stepButtons: some View {
        switch box.status {
        case .terminal:
            Button("Picked up") { box.status = .out }.buttonStyle(.borderedProminent)
        case .out:
            HStack {
                Button("Unloaded, empty") { box.status = .empty }.buttonStyle(.borderedProminent)
                Button("Empty returned") { box.status = .returned }.buttonStyle(.bordered)
            }
        case .empty:
            Button("Empty returned") { box.status = .returned }.buttonStyle(.borderedProminent)
        case .returned:
            Button("Undo return") { box.status = .empty }.buttonStyle(.bordered)
        }
    }
}

struct ClockCard: View {
    let title: String
    let subtitle: String
    let clock: FeeClock?
    let offText: String

    var body: some View {
        let late = clock?.isLate ?? false
        let warn = !late && (clock.map { $0.secondsLeft < 72 * 3600 } ?? false)
        let tint: Color = late ? .red : warn ? .orange : .secondary
        VStack(alignment: .leading, spacing: 4) {
            Text("\(title.uppercased()) · \(subtitle)").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            if let clock {
                Text(clock.isLate ? "-\(Fees.duration(clock.secondsLeft))" : Fees.duration(clock.secondsLeft))
                    .font(.system(.title2, design: .monospaced).weight(.semibold))
                    .foregroundStyle(late || warn ? tint : Color.primary)
                Text(clock.isLate ? "Owed \(Fees.money(clock.accrued)) · \(Fees.money(clock.rate))/day" : "Then \(Fees.money(clock.rate))/day")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Text("n/a").font(.system(.title2, design: .monospaced)).foregroundStyle(.tertiary)
                Text(offText).font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
        .padding(12)
        .background(late ? Color.red.opacity(0.12) : warn ? Color.orange.opacity(0.12) : Color.secondary.opacity(0.08),
                    in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(late || warn ? tint : Color.clear, lineWidth: 1))
    }
}

struct OptionalDateRow: View {
    let title: String
    @Binding var date: Date?
    let components: DatePickerComponents

    var body: some View {
        if let current = date {
            HStack {
                DatePicker(title, selection: Binding(get: { current }, set: { date = $0 }), displayedComponents: components)
                Button { date = nil } label: { Image(systemName: "xmark.circle.fill") }
                    .buttonStyle(.borderless).foregroundStyle(.secondary)
                    .accessibilityLabel("Clear \(title)")
            }
        } else {
            Button("Set \(title)") { date = .now }
        }
    }
}

struct MoneyField: View {
    let title: String
    @Binding var value: Double

    var body: some View {
        LabeledContent(title) {
            TextField(title, value: $value, format: .currency(code: "USD").precision(.fractionLength(0)))
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
        }
    }
}
