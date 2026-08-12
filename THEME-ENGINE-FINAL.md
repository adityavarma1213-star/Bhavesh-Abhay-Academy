# BAA OS Theme Engine — Final

The BAA Student OS now exposes a Theme selector in the top-right of the home screen.

## Themes
1. Aurora — flagship/default
2. Galaxy — student exploration
3. Academic — parent/teacher/school focused
4. NeoGlass — premium modern
5. Calm — focus/wellbeing
6. Duology — child-friendly animated experience

## Display modes
- Light
- Dark
- System (follows browser/device preference)

## Persistence
The selected theme and display mode are stored locally under `baa.theme.preferences.v1` so the preference survives reloads on the same browser/device.

## Safety
The existing Galaxy/space starter experience is intentionally preserved as the entry experience. After entry, BAA OS Engine → Theme Engine exposes six selectable themes. Galaxy also remains Theme #02. Shared learning modules and application logic are preserved.
