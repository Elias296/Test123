---
title: Tizian
emoji: 🖋️
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Tizian-Server für Tintenwerk

Dieser Space stellt Tizian (Qwen2.5-1.5B-Instruct, quantisiert) über eine OpenAI-kompatible
Schnittstelle bereit. Tintenwerk nutzt ihn, wenn „Text auf Server verarbeiten“ eingeschaltet ist.

## Einrichten (kostenlos, im Browser auf dem iPad möglich)

1. Auf huggingface.co anmelden (kostenloses Konto) → oben rechts **New → Space**.
2. Name z. B. `tizian`, **Space SDK: Docker**, Vorlage **Blank**, Hardware **CPU basic (free)**, Sichtbarkeit nach Wahl → **Create Space**.
3. Im Space unter **Files → Add file → Upload files** die beiden Dateien `Dockerfile` und `README.md` aus diesem Ordner hochladen und speichern.
4. Warten, bis oben **Running** steht (der erste Start lädt das Modell, einige Minuten).
5. Die Adresse des Space ist `https://<benutzername>-tizian.hf.space`
   (bei privaten Spaces siehe unten).
6. In Tintenwerk: Text & KI → Tizian → **Server statt lokal** → Adresse eintragen → **Verbindung testen** →
   **Text auf Server verarbeiten** einschalten.

## Schutz mit API-Schlüssel (empfohlen bei öffentlichem Space)

Im Space unter **Settings → Variables and secrets → New secret** den Namen `API_KEY` und einen langen
Zufallswert anlegen. Den Space neu starten und denselben Wert in Tintenwerk als API-Schlüssel eintragen.

## Gut zu wissen

- Gratis-CPU: Antworten kommen langsamer als bei einer GPU (grob einige Wörter pro Sekunde).
- Der Space schläft nach längerer Pause ein. Der erste Aufruf danach dauert 1–2 Minuten.
- Texte, die Tizian bearbeitet, werden an diesen Space gesendet. Andere Daten verlassen das iPad nicht.
- Private Spaces brauchen einen Hugging-Face-Zugangstoken; ein öffentlicher Space mit `API_KEY` ist einfacher.
