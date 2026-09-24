# Test isolé du catalogue français sur Debian / Docker

Branche : `feature/french-catalog-reliability`, issue de `feature/french-comics-bnf`.
Le fichier `compose.fr-test.yaml` utilise le projet Docker `bookkeeprr-fr-test`,
le port 3004 et deux volumes neufs. La stack existante et sa base ne sont pas
utilisées. Aucun montage du dossier de livres existant n'est effectué.

## Installation

Exécuter dans le terminal de la VM Debian, avec Git et Docker Compose v2 installés.
Le compte doit pouvoir lancer Docker (sinon préfixer les commandes Docker par `sudo`).
Utiliser le commit validé indiqué dans le compte rendu de livraison :

```bash
git clone --single-branch --branch feature/french-catalog-reliability https://github.com/mannixteam/bookkeeprr.git "$HOME/bookkeeprr-fr-test"
cd "$HOME/bookkeeprr-fr-test"
git checkout --detach COMMIT_VALIDE
export BOOKKEEPRR_TEST_COMMIT="$(git rev-parse HEAD)"
export BOOKKEEPRR_TEST_BIND=192.168.1.171
docker compose -f compose.fr-test.yaml build --pull
docker compose -f compose.fr-test.yaml up -d --wait --wait-timeout 180
docker compose -f compose.fr-test.yaml ps
```

Remplacer `COMMIT_VALIDE` par le SHA livré. La compilation a besoin d'un accès
Internet et de plusieurs Go libres. Si le dossier existe déjà, ne pas l'écraser :
faire `git fetch origin` depuis ce dossier puis sélectionner le commit validé.

Ouvrir http://192.168.1.171:3004 et créer le compte administrateur de cette instance.
L'instance habituelle reste accessible sur son port actuel.

## Essai fonctionnel

1. Chercher Astérix, Les Légendaires, One Piece, une BD française récente et son ISBN.
2. Vérifier le titre, l'éditeur et les tomes de l'édition choisie. BnF est prioritaire ;
   Google Books complète les éditions françaises. Une clé Google Books personnelle,
   renseignée dans les paramètres, peut être nécessaire si le quota public est épuisé.
3. Ajouter une série avec le suivi réglé sur « aucun » et une racine sous `/media`.
   Vérifier les tomes et les ISBN après la récupération des métadonnées.
4. Ajouter de nouveau la même édition : une seule série doit rester dans la bibliothèque.
5. Vérifier les couvertures après rechargement. Un emplacement vide est préférable
   à une page HTML, une image corrompue ou une couverture arbitraire.

Ne pas connecter cette instance de test au client de téléchargement de production
pendant ce premier essai. Sa bibliothèque `/media` est vide et indépendante.

## Limites explicites

- La disponibilité et les quotas de BnF/Google Books restent externes à l'application.
- La recherche BnF est bornée à cinq pages de 100 notices ; les résultats ne prouvent
  pas qu'une série est complète. Le nombre connu de tomes ne diminue pas au rafraîchissement.
- Les albums sans numéro fiable restent visibles dans le catalogue mais ne créent
  pas de tome numéroté automatiquement. Les intégrales et variantes ne doivent pas
  être confondues avec la série standard.
- Les couvertures sont validées par décodage et contraintes de taille. Cela ne prouve
  pas visuellement qu'une jaquette correspond à l'édition ; les sources sont demandées
  par ISBN/EAN, ARK ou identifiant Google Books.

## Diagnostic et arrêt

```bash
cd "$HOME/bookkeeprr-fr-test"
docker compose -f compose.fr-test.yaml logs --tail=150
docker compose -f compose.fr-test.yaml down
```

`down` arrête uniquement ce projet et conserve ses volumes de test. Il n'y a aucune
restauration à effectuer sur l'instance habituelle puisqu'elle n'a pas été modifiée.
