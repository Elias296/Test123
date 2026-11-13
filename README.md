# Tintenwerk

Einzeldatei-Web-App für das iPad: Screenshots → lokaler OCR-Text → (optional) lokale KI-Umformulierung →
echte Vektor-Handschrift auf einem Goodnotes-Blatt → Export als native `.goodnotes`-Datei oder Vektor-PDF.

Die gesamte App steckt in **`Tintenwerk.html`** (`index.html` leitet nur dorthin weiter).

## Kurzanleitung für das iPad Air (M2)

### 1. Kostenlos per HTTPS bereitstellen
`file://` reicht nicht: Safari schaltet dort WebGPU, Web-Worker (OCR) und „Zum Home-Bildschirm“ nicht bzw. nur eingeschränkt frei.

**GitHub Pages**
1. Repository auf GitHub öffnen → **Settings → Pages**.
2. *Source*: **Deploy from a branch**, Branch mit `Tintenwerk.html` wählen, Ordner `/ (root)` → **Save**.
3. Nach ca. einer Minute ist die App unter `https://<benutzername>.github.io/<repository>/Tintenwerk.html` erreichbar.
   (Pages benötigt bei kostenlosen Konten ein öffentliches Repository.)

**Alternative Cloudflare Pages:** *Workers & Pages → Create → Pages → Upload assets*, Ordner mit `Tintenwerk.html`
hochladen → `https://<projekt>.pages.dev/Tintenwerk.html`.

### 2. Zum Home-Bildschirm hinzufügen
Adresse in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**. Tintenwerk startet danach im Vollbild.
Entwurf, Einstellungen und eigene Handschrift liegen nur im lokalen Browserspeicher – die Handschrift bitte
zusätzlich als JSON sichern (Schritt 2 → Sicherung).

### 3. Export in Goodnotes öffnen
1. **Exportieren → Native .goodnotes-Datei erzeugen**.
2. **„Teilen / in Goodnotes öffnen“** tippen und *Goodnotes* wählen – oder **„In ‚Dateien‘ sichern“**, die Datei in der
   Dateien-App antippen und über Teilen → *In Goodnotes öffnen*.
3. In Goodnotes **„Als neues Dokument importieren“**. Die Schrift besteht aus einzelnen Stiftstrichen
   (Lasso, Radierer und Farbwechsel funktionieren wie bei eigener Handschrift).

### Lokale KI (optional)
WebGPU ist in Safari ab iPadOS 26 aktiv (unter iPadOS 18: Einstellungen → Apps → Safari → Erweitert → Feature Flags → WebGPU).
Das Modell (ca. 480 MB) wird erst nach Tipp auf „Lokales KI-Modell laden“ geholt. Ohne KI funktioniert alles andere unverändert.

## Aufgaben lösen (Hausaufgaben-Helfer)
Import & Text → Karte **Aufgaben lösen**: optionalen Namen für die Überschrift, Klasse und „Rechenweg zeigen“ einstellen, **Tizian** (so heißt die lokale KI) laden
(für Aufgaben wird **Besser · Qwen2.5-1.5B** empfohlen), dann **Buchseite(n) senden & lösen**.
Ablauf: Zuschnitt → lokale OCR → Aufgaben werden an Nummern („1.“, „2)“, „Aufgabe 3“) getrennt → reine Rechenzeilen (`345 + 678 =`) löst ein exakter
Rechner, alles andere die lokale KI → Vergleichsfenster (Aufgaben links, Lösungen rechts, beides bearbeitbar, „Erneut lösen“) → Übernahme als neue Notiz
oder angehängt (mit Undo) → Vektor-Handschrift im Goodnotes-Export.
Grenzen: nur Texterkennung (keine Bilder, Diagramme, Handschrift, Formeln), kleine Modelle machen Fehler; die Größenangaben der Modelle sind geschätzt
und das 1,5-B-Modell wurde nicht auf einem iPad getestet (Speicherbedarf!).

## Technische Eckdaten des .goodnotes-Exports (aus der Referenzdatei abgeleitet)
- ZIP (Deflate) mit `index.events.pb`, `index.notes.pb`, `index.attachments.pb`, `index.search.pb`, `notes/…`,
  `attachments/…` (Hintergrund-PDF), `search/…`, `thumbnail.jpg`, `schema.pb` (Schema 24).
- Stiftstriche: TPL `vuA(v)A(S(uu))A(S(uuuu))vA(f)` (quadratische Bézier-Segmente) im Apple-LZ4-Container `bv41 … bv4$`.
- **Stiftspeicher-UUID = Seiten-UUID + 1** für jede Seite.
- Hintergrund-PDF in echten PDF-Punkten (419,53 × 595,28); Stiftkoordinaten = PDF-Punkt × 11/6.
- Kein offizielles Format: künftige Goodnotes-Versionen können sich anders verhalten.

## Nachgeladene Quellen (nur bei Bedarf)
- Tesseract.js 7.0.0 inkl. `tesseract.js-core` und Sprachdaten `deu`/`eng` (cdn.jsdelivr.net) – OCR
- Transformers.js 4.3.2 (cdn.jsdelivr.net) und Modell `onnx-community/Qwen2.5-0.5B-Instruct` oder `…-1.5B-Instruct` (huggingface.co) – lokale KI

ZIP, LZ4, TPL, Protobuf und PDF sind in der Datei selbst implementiert; kein Tracking, kein Konto.

## Entwicklung
- Quellen: `dev/src/` · Bauen: `dev/tools/build.sh` (schreibt `Tintenwerk.html`) · Tests: `node dev/tools/test.js`
- `dev/tools/shape.py` vergleicht eine erzeugte `.goodnotes` strukturell mit einer Referenzdatei (`python3 -I dev/tools/shape.py ref.goodnotes out.goodnotes`).
- Änderungen immer in `dev/src/` machen und neu bauen, nicht in `Tintenwerk.html`.
