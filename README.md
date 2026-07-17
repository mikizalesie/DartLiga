# 🎯 DartLiga PWA

Responsywna aplikacja PWA do liczenia punktów i prowadzenia rozgrywek darta. Działa w przeglądarce, można ją zainstalować na telefonie lub komputerze, a po pierwszym uruchomieniu działa także offline.

## Funkcje

- licznik X01: 301, 501, 701 i 1001,
- mecze do wybranej liczby wygranych legów,
- kontrola BUST i cofanie ostatniej wizyty,
- liga „każdy z każdym”, faza grupowa i turniej pucharowy,
- automatyczna tabela wyników i bilans legów,
- statystyki: średnia 3-dart, 100+, 140+, 180, High Out i Best Leg,
- ręczne wpisywanie wyników,
- eksport i import kopii JSON,
- zapis danych w `localStorage`,
- instalacja jako PWA i działanie offline.

## Publikacja na GitHub Pages

Repozytorium zawiera gotowy workflow `.github/workflows/deploy-pages.yml`. Po każdym wysłaniu zmian do gałęzi `main` aplikacja może publikować się automatycznie.

### 1. Utwórz repozytorium

Na GitHubie utwórz nowe repozytorium, na przykład:

```text
dartliga-pwa
```

Repozytorium może być publiczne. Nie zaznaczaj dodawania README, `.gitignore` ani licencji, ponieważ te pliki są już w paczce.

### 2. Wgraj pliki

Najprościej:

1. Otwórz utworzone repozytorium.
2. Kliknij **Add file → Upload files**.
3. Przeciągnij całą zawartość tej paczki, łącznie z folderami `.github` oraz `icons`.
4. Zapisz zmiany przyciskiem **Commit changes**.

> Uwaga: folder `.github` jest ukryty w Windows. W Eksploratorze plików włącz **Widok → Pokaż → Ukryte elementy** albo użyj poniższych poleceń Git.

### 3. Włącz GitHub Pages

1. Wejdź w **Settings** repozytorium.
2. W menu po lewej wybierz **Pages**.
3. W sekcji **Build and deployment** ustaw **Source: GitHub Actions**.
4. Otwórz zakładkę **Actions** i sprawdź workflow **Publikacja DartLiga PWA**.

Po poprawnym wdrożeniu adres będzie miał postać:

```text
https://TWOJ-LOGIN.github.io/dartliga-pwa/
```

### 4. Aktualizowanie aplikacji

Każdy commit wysłany do gałęzi `main` uruchamia ponowną publikację. Service Worker ma własny numer cache, dlatego przy zmianach aplikacji warto zwiększyć wartość w `sw.js`, na przykład:

```js
const CACHE = 'dartliga-pwa-v1.0.2';
```

## Wgrywanie przez Git

W terminalu otwartym w folderze projektu wykonaj:

```bash
git init
git add .
git commit -m "Pierwsza wersja DartLiga PWA"
git branch -M main
git remote add origin https://github.com/TWOJ-LOGIN/dartliga-pwa.git
git push -u origin main
```

Zastąp `TWOJ-LOGIN` swoim loginem GitHub.

## Uruchomienie lokalne

Service Worker wymaga `localhost` albo HTTPS. W folderze aplikacji uruchom:

```bash
python -m http.server 8080
```

Następnie otwórz:

```text
http://localhost:8080
```

## Struktura repozytorium

```text
.github/workflows/deploy-pages.yml  automatyczna publikacja
icons/                             ikony PWA
index.html                         główny plik strony
styles.css                         wygląd aplikacji
app.js                             logika aplikacji
manifest.webmanifest               konfiguracja instalacji PWA
sw.js                              działanie offline
.nojekyll                          wyłączenie przetwarzania Jekyll
LICENSE                            licencja MIT
README.md                          instrukcja projektu
```

## Dane użytkownika

Wersja 1.0.1 zapisuje dane lokalnie na konkretnym urządzeniu. Wyniki nie synchronizują się jeszcze automatycznie pomiędzy telefonami. Kopię można pobrać i przywrócić w zakładce **Ustawienia**.
