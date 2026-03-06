# bb_bn1 - Bitburner BN1 starter kit (v2.8.x)

Kit autonome pour jouer un run BN1 sans SF.

## Contenu
- `bootstrap/pull.js`: sync des scripts depuis GitHub raw (via `manifest.txt`)
- `main/deploy.js`: root + scp + lancement du controller
- `main/controller.js`: autopilot simple (prep + batch)
- `workers/*.js`: workers one-shot hack/grow/weaken
- `report/snapshot.js`: rapport JSON detaille
- `report/summary.js`: resume lisible + format compact
- `report/diff.js`: diff entre deux snapshots

## Install in-game depuis GitHub
1. Bootstrap une seule fois:

```js
wget https://raw.githubusercontent.com/<owner>/<repo>/<branch>/bb_bn1/bootstrap/pull.js /bb_bn1/bootstrap/pull.js
```

2. Pull de tous les scripts du kit:

```js
run /bb_bn1/bootstrap/pull.js <owner>/<repo> <branch>
```

Exemple:

```js
run /bb_bn1/bootstrap/pull.js Tyler/my-bitburner-repo main
```

## Deploiement in-game
Lancer le deploiement standard:

```js
run /bb_bn1/main/deploy.js --clean
```

Options utiles:
- `--reserve-home <ram>`: RAM reservee sur home (defaut: `32`)
- `--target <host>`: forcer une cible
- `--dry-run`: tester sans lancer le controller

Exemples:

```js
run /bb_bn1/main/deploy.js --clean --reserve-home 64
run /bb_bn1/main/deploy.js --target foodnstuff
```

## Reporting (format pour pilotage)
1. Creer un snapshot JSON:

```js
run /bb_bn1/report/snapshot.js --label tick-01
```

2. Resume lisible:

```js
run /bb_bn1/report/summary.js
```

3. Resume compact (a me coller tel quel):

```js
run /bb_bn1/report/summary.js --compact
```

4. Diff automatique entre les 2 derniers snapshots archives:

```js
run /bb_bn1/report/diff.js
```

5. Diff compact JSON:

```js
run /bb_bn1/report/diff.js --json
```

## Boucle de jeu recommandee
1. `pull`
2. `deploy --clean`
3. attendre 5-15 min
4. `snapshot`
5. `summary --compact` et `diff --json`
6. me coller ces sorties pour la decision suivante

## Notes
- Le controller tente de root automatiquement les serveurs des que les openers sont dispos.
- Le target picking est volontairement robuste/sobre pour BN1 early game.
- Les rapports sont ecrits sous `/bb_bn1/reports/`.