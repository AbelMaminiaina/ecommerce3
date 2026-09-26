# Polices du site (hébergées localement)

Fichiers woff2 « variables » (sous-ensemble latin) chargés par `src/lib/fonts.ts` avec `next/font/local` :
aucune requête vers Google, ni au build ni chez les visiteurs.

| Fichier | Police | Graisses | Licence |
|---|---|---|---|
| `roboto-latin.woff2` | Roboto | 300 à 700 | SIL Open Font License 1.1 (`OFL-roboto.txt`) |
| `inter-latin.woff2` | Inter | 400 à 700 | SIL Open Font License 1.1 (`OFL-inter.txt`) |
| `quicksand-latin.woff2` | Quicksand | 400 à 700 | SIL Open Font License 1.1 (`OFL-quicksand.txt`) |

Source : Google Fonts (fonts.google.com). Pour ajouter une graisse ou un alphabet, télécharger le woff2
correspondant et l'ajouter à `src/lib/fonts.ts`.
