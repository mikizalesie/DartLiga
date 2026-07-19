# Aktualizacja DartLiga PWA do wersji 1.4.0

## Nowa funkcja: Pojedynczy mecz

W menu aplikacji pojawiła się osobna zakładka **Pojedynczy mecz**.

Możesz w niej:

- ręcznie wpisać nazwy dwóch graczy,
- ustawić dowolny wynik startowy, np. 50, 301, 501, 701 lub 1001,
- ustawić liczbę legów potrzebnych do zwycięstwa,
- wybrać Double Out albo Straight Out,
- wskazać gracza rozpoczynającego pierwszy leg,
- wznowić rozpoczęty mecz,
- zapisać zakończony mecz w osobnej historii,
- rozpocząć rewanż,
- usunąć wybrany mecz z historii.

Pojedyncze mecze nie wpływają na terminarz, tabelę ani statystyki ligi.

## Aktualizacja GitHub Pages

1. W aplikacji wykonaj **Ustawienia → Eksportuj JSON**.
2. Rozpakuj paczkę aktualizacyjną.
3. W repozytorium wybierz **Code → Add file → Upload files**.
4. Wgraj do głównego katalogu pliki:
   - `app.js`
   - `styles.css`
   - `index.html`
   - `sw.js`
5. Zatwierdź **Commit changes**.
6. Poczekaj na zielony status publikacji w **Actions**.
7. Otwórz aplikację i wykonaj `Ctrl + F5`.

W lewym dolnym rogu aplikacji powinien pojawić się numer **1.4.0**.

Dotychczasowe ligi, turnieje, wyniki i statystyki pozostają zapisane.
