# Across design assets

Original assets downloaded from [HelloHacks in Figma](https://www.figma.com/design/QeWuJMoSsN8PBjkWlH8o1z/HelloHacks?node-id=0-1). SVG source dimensions are preserved. Assets are bundled locally through `src/constants/design.ts`; no temporary Figma URLs are used at runtime.

| Assets | Source | App use |
| --- | --- | --- |
| home, homeActive, sunrise | Home `1:2`, Schedule `1:1192` | Home navigation and greeting |
| checkin, checkinActive, morning, promptHeart | Check-in `1:1462` | Check-in navigation, hero, home moment card |
| brain, ideas, ideasActive | Schedule `1:1192`, Home `1:2` | Brainstorm heading and navigation |
| all-0 through all-3, movie, game, recipe | Schedule `1:1192` | Category icons; All is composed from its original four layers |
| timezone, games | Schedule `469:706`, `464:705` | Two discovery tiles |
| coast, garden | Schedule `431:418`, `421:318` | Exported illustration groups, two discovery tiles |
| upcoming, upcomingActive, calendar | Schedule `1:1192`, Upcoming `365:1335` | Upcoming navigation and headings |
| account, accountActive | Schedule `1:1192`, Account `434:475` | Account navigation |

## Adaptation to working features

- The existing Expo Router routes remain intact. Five visible tabs follow the design; `/time` is accessible through the pair clock header, Home, Schedule, and Account.
- Check-in contains Our Daily Moment, including uploads, timed reveal, reactions, and expiry. The mockup's standalone mood messages are not presented as working features.
- Real profile names, initial avatars, time zones, room age, recommendations, and plans replace sample data. Weather, distance, profile photos, and relationship age are not fabricated.
- Existing email-link authentication stays in place; mock social login and password controls are not added.
- Real recommendation and plan images stay dynamic. Stock activity images and cat profile photos from the mockup are not used as user data.
- Text contrast is increased over the pale mockup labels. Layouts scroll and adapt rather than clipping controls to a fixed device frame.
- No backend, API, storage, or account configuration changes are required.
