# Truhenzähler – Clan-Truhen für Total Battle

Web-App (Next.js 15, TypeScript, Tailwind, Prisma), mit der Clans ihre Clan-Truhen erfassen, prüfen, auswerten und mit Wochenzielen verfolgen. Konzept, Datenmodell, Bildschirme und Entwicklungsplan stehen in **[KONZEPT.md](./KONZEPT.md)**.

## Schnellstart
```bash
cd truhenzaehler
cp .env.example .env           # Secrets anpassen!
npm install
npm run db:push && npm run db:seed
npm run dev                    # http://localhost:3000
```
Demo-Logins: `admin`, `offizier`, `mitglied` – Passwort `Truhen-Demo-2026`.

## Befehle
| Befehl | Zweck |
|---|---|
| `npm test` | Tests der Kernlogik (Duplikate, Punkte, Prognose, Wochen, CSV, OCR-Parser) |
| `npm run build` | Produktions-Build inkl. Typprüfung |
| `npx tsx scripts/sync-agent.ts ./inbox` | automatischer Import alle 15 Min. (Screenshots/TXT/CSV) |

## Schnittstellen
- `POST /api/ingest` (Bearer `INGEST_TOKEN`) – Truhen automatisch einspielen, idempotent
- `POST /api/cron/erinnerungen` (Bearer `CRON_TOKEN`) – Hinweise an Offiziere per Discord-/Slack-Webhook
- `GET /api/export?format=csv|xlsx|pdf&von=JJJJ-MM-TT&bis=JJJJ-MM-TT` – Export (ab Rolle Offizier)

## Aufbau
```
prisma/schema.prisma      Datenmodell        src/lib/dedupe.ts     Duplikatschutz
prisma/seed.ts            Demodaten          src/lib/ingest.ts     zentrale Erfassung
src/app/(intern)/…        Bildschirme        src/lib/stats.ts      Auswertungen
src/app/actions.ts        Server-Aktionen    src/lib/forecast.ts   Zielprognose
src/app/api/…             Import/Export/Cron src/lib/giftParser.ts OCR-Text → Truhen
src/app/clan/[token]      Clan-Link          scripts/sync-agent.ts 15-Minuten-Sync
```
