# Mobile Architecture: React Native & Expo Mastery

## 1. The Modern Stack: Expo Router
Forget `react-navigation`. Use file-based routing similar to Next.js.
- **Files**: `app/(tabs)/index.tsx`, `app/[id].tsx`.
- **Linking**: Deep linking is automatic. `Link href="/details/1"`.

## 2. State & Data
- **Local**: `MMKV` instead of `AsyncStorage` (30x faster C++ implementation).
- **Remote**: TanStack Query to cache API responses offline.
- **Sync**: WatermelonDB for complex offline-first requirements (SQLite under the hood).

## 3. Native Modules & JSI
The bridge is dead. Use JSI (JavaScript Interface) for direct C++ communication.
- **Reanimated 3**: Runs animation logic on the UI thread. No bridge traffic.
- **Skia**: Canvas-like high performance graphics (Charts, Filters).

## 4. Performance Checklist
1. **FlashList**: Replace `FlatList` with Shopify's `FlashList` (Reuse views = 60fps).
2. **Memoization**: `useMemo()` heavy calculations. `useCallback()` props passed to children.
3. **Hermes**: Ensure Hermes engine is ON. It pre-compiles JS to Bytecode.
4. **Image Caching**: Use `expo-image` for aggressive LRU caching.

## 5. Deployment (CI/CD)
- **EAS Build**: Cloud builds for IPA/APK. 
- **EAS Update**: Push Over-the-Air (OTA) updates for JS changes instantly.
- **Version Control**: Semantic versioning for native binaries.
