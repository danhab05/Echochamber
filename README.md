# EchoChamber

La même vidéo (ou le même son), jouée plusieurs fois en même temps avec un léger décalage entre chaque copie : écho, doubleur, chorus, effet de foule…

## Deux sources

| | YouTube | Fichier local |
|---|---|---|
| Comment | Une copie = un lecteur YouTube, recalé en continu sur l'original | Le son passe par la Web Audio API (une ligne de retard par copie) |
| Décalage | 20 ms → 1 s (approximatif sous ~100 ms) | 0,1 ms → 1 s, exact à l'échantillon |
| Stéréo | — | Copies réparties gauche / droite |
| Image | Une vignette par lecteur | Vignettes recalculées à partir des images passées |

Réglages : nombre de copies (1–12), décalage, persistance (volume gardé d'une copie à la suivante), largeur stéréo, volume général. Préréglages : flanger, chorus, doubleur, slapback, écho, canyon, foule. Espace = lecture / pause.

## Lancer

```bash
npm install
npm run dev   # http://localhost:9002
```

## Code

- `src/lib/youtube.ts` : chargement de l'API IFrame + `YouTubeEchoController` (le lecteur 0 sert d'horloge, les autres sont mesurés et recalés quand ils dérivent ; la latence de seek de chaque lecteur est apprise).
- `src/lib/audio-engine.ts` : `EchoAudioEngine`, graphe Web Audio (delay → gain → pan par copie, puis limiteur).
- `src/lib/echo.ts` : paramètres, préréglages, calculs de gain / pan / échelle du curseur de délai.
- `src/components/echo/` : interface (scènes YouTube et fichier, contrôles, transport, visualiseur).
