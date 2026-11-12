# Truhenzähler für Total Battle – Konzept

## 1. Produktbeschreibung

**Truhenzähler** ist eine responsive Web-App, die **Clan-Truhen** zählt – also die Truhen, die ein Mitglied für den Clan erzeugt und die im Clan-Menü unter „Geschenke“ erscheinen. Individuell geöffnete Truhen eines Mitglieds zählen nicht. Die App ordnet jede Truhe genau einem Mitglied zu, verhindert Doppelzählungen und berechnet Punkte nach einer festen Punkteregel. Daraus entstehen ein Clan-Dashboard, Wochenziele mit Prognose und Berichte für die Clan-Leitung.

Leitprinzipien:
- **Nachvollziehbar:** Jede Zahl lässt sich bis zur einzelnen Truhe zurückverfolgen. Gespeichert werden die Erfassungsart, die Rohzeile aus Import oder OCR und wer die Truhe erfasst hat.
- **Korrekt:** Gezählt werden nur Truhen mit Status *Gültig*. Mögliche Duplikate landen in einer Prüfliste, statt still gezählt oder verworfen zu werden.
- **Korrigierbar:** Offiziere können jede Truhe korrigieren, müssen dabei aber einen Grund angeben. Alte und neue Werte stehen im Änderungsprotokoll.
- **Einfach:** Die Oberfläche ist komplett auf Deutsch, die Navigation hat drei Ebenen, und die Filter stehen in der URL, damit man gefilterte Ansichten als Link teilen kann.

## 2. Datenmodell

| Tabelle | Wichtige Felder | Zweck |
|---|---|---|
| **Mitglieder** (`Member`) | id, name (Ingame, eindeutig), aliases, clanRank, joinedAt, status (AKTIV/PAUSIERT/AUSGETRETEN), notes | Spielfiguren im Clan; über Aliasse werden OCR-Schreibweisen und Umbenennungen erkannt |
| **Benutzerrollen** (`User`) | id, username, passwordHash (bcrypt), role (ADMIN/OFFIZIER/MITGLIED), memberId, active, lastLoginAt | Login-Konten und Berechtigungen |
| **Truhentypen** (`ChestType`) | name, category (STANDARD/EVENT/SELTEN), basePoints, pointsPerTier, active | Punkteregel: `Punkte = Basis + (Stufe − 1) × Aufschlag` |
| **Truhen** (`Chest`) | memberId, capturedAt, chestTypeId, tier, source, points (fest gespeichert), eventId, origin (MANUELL/CSV/OCR/API), status (GUELTIG/PRUEFEN/VERWORFEN), fingerprint (eindeutig), rawText, createdById | Eine Zeile pro Clan-Truhe |
| **Events** (`Event`) | name, startAt, endAt, goalPoints | Event-Truhen werden separat ausgewiesen und automatisch dem passenden Event zugeordnet |
| **Ziele** (`Goal`) | scope (CLAN/MITGLIED), memberId, periodStart, periodEnd, metric (PUNKTE/TRUHEN), targetValue | Der Fortschritt wird **live berechnet** und nie gespeichert, damit er immer zum aktuellen Datenstand passt |
| **Änderungsprotokoll** (`AuditLog`) | userId, action, entity, entityId, oldValues, newValues (JSON, nur geänderte Felder), reason, createdAt | Lückenlose Historie |
| **Einstellungen** (`Settings`) | clanName, defaultMemberGoalPoints, inactiveAfterDays, publicEnabled, publicToken, publicPasswordHash, webhookUrl | Clan-Konfiguration |

Schema: `prisma/schema.prisma`. Für die Entwicklung wird SQLite verwendet. Für den Betrieb genügt es, `provider = "postgresql"` zu setzen.

### Duplikatschutz
`fingerprint = SHA-256(Mitglied | Typ | Stufe | Quelle | Minute | Ordinal)`. Das *Ordinal* ist die laufende Nummer gleichartiger Truhen innerhalb derselben Minute eines Schnappschusses.
- Wird derselbe Schnappschuss erneut importiert, entstehen dieselben Fingerabdrücke. Die Truhen werden übersprungen, der Import ist also idempotent.
- Zwei echte, gleiche Truhen in derselben Minute erhalten Ordinal 0 und 1 und werden beide gezählt.
- Liegt eine gleichartige Truhe ±2 Minuten versetzt (OCR- oder Rundungsfehler), bekommt sie den Status **PRUEFEN** und wartet auf eine Offiziersentscheidung.

## 3. Bildschirme

| Bildschirm | Pfad | Inhalt | Rolle |
|---|---|---|---|
| **Dashboard** | `/` | Kennzahlen, Wochenfortschritt mit Prognose, Punkte pro Tag (regulär/Event), Top 10, Typen, Stufen, Quellen, Event-Truhen, inaktive Mitglieder, gefährdete Ziele, letzte Aktivitäten; Filter für Zeitraum, Typ, Quelle und Events | alle |
| **Truhenliste** | `/truhen` | sortierbare und filterbare Tabelle mit Seitenblättern; Prüfliste (`?status=PRUEFEN`) mit Sammelaktion „Freigeben/Verwerfen“ | alle (Aktionen: Offizier) |
| **Truhe erfassen / Import** | `/truhen/neu` | Einzelerfassung und CSV-Import mit Ergebnisbericht (neu / Duplikate / zu prüfen / Fehler je Zeile) | Offizier |
| **Truhendetail** | `/truhen/[id]` | Herkunft, Rohdaten, Korrekturformular mit Pflicht-Grund, Protokoll der Truhe | alle (Korrektur: Offizier) |
| **Mitglieder** | `/mitglieder` | alle Mitglieder mit Wochenpunkten, Zielbalken und Prognose; sortierbar | alle |
| **Mitgliederprofil** | `/mitglieder/[id]` | KPIs, Clan-Platz, Wochenziel, 8-Wochen-Verlauf, Tagesaktivität, Typverteilung, letzte Truhen, Stammdaten und Protokoll | alle (Bearbeiten: Offizier) |
| **Zielübersicht** | `/ziele` | Clan-Wochenziel, Verteilung der Prognosestatus, Ziele festlegen, individuelle Ziele, Verlauf | alle (Bearbeiten: Offizier) |
| **Berichte** | `/berichte` | Wochenzusammenfassung als kopierbarer Text (z. B. für Discord), Export als CSV, Excel und PDF | Offizier |
| **Admin-Bereich** | `/admin` | Reiter: Mitglieder, Events, Änderungsprotokoll · *nur Admin:* Benutzer & Rollen, Truhentypen & Punkte, Einstellungen & Clan-Link | Offizier / Admin |
| **Clan-Link** | `/clan/[token]` | Dashboard nur lesbar, öffentlich oder mit Passwort; Link jederzeit erneuerbar | ohne Login |

## 4. Entwicklungsplan

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **0 – Grundlagen** (½ Woche) | Next.js, Prisma, Auth, Rollen, Layout, Seed | lauffähiges Gerüst ✅ |
| **1 – Erfassung** (1 Woche) | manuelle Eingabe, CSV-Import, Duplikatschutz, Prüfliste, Korrekturen mit Protokoll | Offiziere können zählen ✅ |
| **2 – Auswertung** (1 Woche) | Dashboard, Mitgliederprofil, Filter, Event-Trennung | Clan sieht Zahlen ✅ |
| **3 – Ziele** (½ Woche) | Clan- und Mitgliedsziele, Prognose, Webhook-Hinweise | Wochensteuerung ✅ |
| **4 – Berichte** (½ Woche) | CSV/Excel/PDF, Wochenzusammenfassung, Clan-Link | Leitung erhält Berichte ✅ |
| **5 – Automatisierung** (1–2 Wochen) | Sync-Agent mit OCR (Tesseract) alle ≤ 15 Min., Abgleich mit echten Screenshots, Alias-Pflege | weniger Handarbeit (Gerüst ✅, Feinschliff am echten Spiel offen) |
| **6 – Betrieb** (½ Woche) | PostgreSQL, Hosting (z. B. Vercel + Neon oder Docker), Backups, Cron (Erinnerungen täglich), Rate-Limit im Redis, 2FA optional | produktiv |
| **7 – Ausbau** | Saison-/Monatsvergleiche, Punkteregel je Stufe als Tabelle, Discord-Bot-Befehle, mehrere Clans | optional |

### Automatische Erfassung – ehrliche Einordnung
Total Battle bietet **keine öffentliche API**. Realistisch sind diese Wege:
1. **Screenshots + OCR:** Der Sync-Agent liest Bilder der Clan-Truhenliste (`scripts/sync-agent.ts`, Tesseract). Den Erstellungszeitpunkt berechnet er aus der angezeigten Restzeit, sodass dieselbe Truhe in jedem Schnappschuss denselben Zeitstempel bekommt.
2. **CSV-Exporte** aus bestehenden Clan-Tools oder Tabellen.
3. **Eigene API** (`POST /api/ingest` mit Token) für Browser-Erweiterungen oder Bots, die ihr selbst betreibt.

Klick-Bots, die das Spiel automatisch bedienen, können gegen die Nutzungsbedingungen verstoßen. Der Agent liest deshalb nur Screenshots, die ihr selbst erstellt.

## 5. Dashboard-Struktur

```
┌──────────────────────────────────────────────────────────────────────┐
│ Clan-Dashboard · KW 46/2026            [⚠ 2 zu prüfen] [+ Truhe]     │
│ [Zeitraum] [Von] [Bis] [Typ] [Quelle] [Events] [Anwenden]            │
├───────────────┬───────────────┬───────────────┬──────────────────────┤
│ TRUHEN 237    │ PUNKTE 7.309  │ BEITRAGENDE 25│ WOCHENZIEL 81 %      │  Ebene 1
│ 23 aus Events │ ▼16 % ggü. VW │ Ø 292 P       │ [Auf Kurs]           │  KPIs
├───────────────┴──┬────────────┴───────────────┴──────────────────────┤
│ Wochenfortschritt│ Punkte pro Tag (gestapelt: Regulär | Event)       │  Ebene 2
│ ███████░░ Progn. │ ▇ ▆ █ ▅ · · ·                                     │  Trend
├──────────────────┴─────────────────────────────┬─────────────────────┤
│ Top 10 (Truhen, Punkte, Event, Anteil)         │ Truhen nach Typ ◔   │  Ebene 3
├────────────────┬───────────────────────────────┼─────────────────────┤  Detail
│ nach Stufe ▬▬  │ nach Quelle + Event-Truhen    │ Inaktiv · gefährdet │
├────────────────┴───────────────────────────────┴─────────────────────┤
│ Letzte Aktivitäten (12) ………………………………………………… Alle Truhen →    │
└──────────────────────────────────────────────────────────────────────┘
Mobil: Kacheln im 2er-Raster, alles darunter einspaltig, Navigation unten.
```

## 6. Datenschutz & Sicherheit
- Gespeichert werden nur Ingame-Namen und Spieldaten, keine E-Mail-Adressen und keine Klarnamen.
- Passwörter liegen als bcrypt-Hash (Kostenfaktor 12) vor. Die Sitzung läuft über ein signiertes JWT in einem httpOnly-Cookie (SameSite=Lax, im Betrieb `Secure`).
- Die Rolle wird bei jeder Anfrage frisch aus der Datenbank gelesen, sodass ein Entzug sofort wirkt. Deaktivierte Konten werden abgewiesen.
- Bei wiederholten Fehlversuchen wird die Anmeldung gebremst. Import und Cron sind nur mit Token erreichbar (zeitkonstanter Vergleich).
- Beim CSV-Export wird Formel-Injection verhindert. Sicherheits-Header sind gesetzt, und der Clan-Link ist für Suchmaschinen gesperrt (`noindex`).
- Ausgetretene Mitglieder werden nicht gelöscht, damit alte Auswertungen stimmen. Eine Löschung auf Wunsch (DSGVO Art. 17) ist über eine Anonymisierung des Namens möglich.
