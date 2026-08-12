# DartLiga PWA 2.0.4

## Przywrócona punktacja w liczniku X01

Naprawiono błąd CSS z wersji 2.0.3, przez który górna tablica z wynikami zawodników mogła zniknąć w zwykłym widoku licznika. Przyczyną było pełne `size containment` na kontenerze celebracji. Zmieniono je na bezpieczne `inline-size` i dodano minimalne zabezpieczenie wysokości tablicy.

## Tryb Administrator

Przełącznik roli ma teraz trzeci tryb: Administrator. Administrator zachowuje wszystkie możliwości organizatora i dostaje narzędzia awaryjne:

- Wymuś zakończenie rozgrywki,
- wyczyść aktywny licznik i stany LIVE,
- rozpoczęte, niezakończone mecze wracają do statusu zaplanowanych,
- zakończone wyniki są zachowywane,
- możliwość trwałego usunięcia testowej rozgrywki po dodatkowym potwierdzeniu.

Narzędzia administratora są dostępne na liście „Moje rozgrywki” oraz w Ustawieniach. To nadal tryb testowy UI — nie jest to jeszcze zabezpieczone logowaniem administratora po stronie serwera.

## Aktualizacja

Wgraj `app.js`, `styles.css`, `index.html` i `sw.js`. Po publikacji zamknij PWA, uruchom ponownie i wykonaj `Ctrl+F5`.
