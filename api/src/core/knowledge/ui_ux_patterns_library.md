# UI/UX Patterns Library: Engineering for Humans

## 1. Micro-interactions (The Soul of UI)
- **Feedback Loops**: Every action needs a reaction.
    - *Buttons*: Scale down by 2% on active click.
    - *Hovers*: Transition border-color and box-shadow over 200ms.
- **Spring Physics**: Use spring animations (Framer Motion) instead of linear transitions for a "living" organic feel.
    - `stiffness: 400, damping: 25`.

## 2. Component Architecture
- **Buttons**:
    - *Primary*: Solid color, strong shadow.
    - *Secondary*: Border only (ghost), subtle background on hover.
    - *Tertiary*: Text only, changes color/underline on hover.
- **Inputs**: Floating labels or high-contrast placeholders. Ensure `focus-visible` states are beautiful (e.g., glowing rings).

## 3. UX Psychology
- **Miller's Law**: The average person can only keep 7 (plus or minus 2) items in their working memory. Chunk complex forms into steps.
- **Fitts's Law**: The time to acquire a target is a function of the distance to and size of the target. Make primary buttons LARGE and easy to click.
- **Hick's Law**: Increasing the number of choices will increase the decision time. Simplify menus.

## 4. Scannability Patterns
- **F-Pattern**: Users scan text-heavy pages in an F-shape. Put key info in headers and bullet points.
- **Z-Pattern**: For landing pages. Top bar -> Hero Content -> Call to Action.
- **Dark Mode Optimization**: Use "Elevated Surfaces" (darker background, lighter surfaces) rather than pure black to prevent eye strain.
