/**
 * MobileBuilderTool - React Native / Expo App Generator
 * 
 * God Mode Feature: Generates complete mobile apps with
 * React Native or Expo, including navigation, state, and native modules.
 * 
 * @version 1.0.0
 */

import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { handleShellCommand } from '../handlers';
import fs from 'fs';
import path from 'path';

export class MobileBuilderTool extends BaseTool {
    name = 'mobile_builder';
    description = 'Generate React Native / Expo mobile applications with navigation, state management, and native integrations.';
    version = '1.0.0';
    tags = ['mobile', 'react-native', 'expo', 'ios', 'android', 'god-mode'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string',
                enum: ['init', 'add-screen', 'add-navigation', 'add-state', 'build', 'run'],
                description: 'Action to perform'
            },
            projectName: { type: 'string', description: 'Name of the mobile project' },
            outputDir: { type: 'string', description: 'Output directory' },
            template: {
                type: 'string',
                enum: ['blank', 'tabs', 'drawer', 'stack'],
                description: 'Project template'
            },
            platform: {
                type: 'string',
                enum: ['expo', 'react-native-cli'],
                description: 'Platform to use'
            },
            screenName: { type: 'string', description: 'Name of screen to add' },
            stateManager: {
                type: 'string',
                enum: ['zustand', 'redux', 'jotai', 'context'],
                description: 'State management library'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' },
            files: { type: 'array', items: { type: 'string' } },
            commands: { type: 'array', items: { type: 'string' } }
        }
    };

    permissions: ToolPermission[] = ['write', 'execute'];
    sideEffects: ToolPermission[] = ['write', 'execute'];

    async execute(input: any) {
        const logs: string[] = [];
        const action = input.action;

        try {
            switch (action) {
                case 'init':
                    return await this.initProject(input, logs);
                case 'add-screen':
                    return await this.addScreen(input, logs);
                case 'add-navigation':
                    return await this.addNavigation(input, logs);
                case 'add-state':
                    return await this.addStateManagement(input, logs);
                case 'build':
                    return await this.buildApp(input, logs);
                case 'run':
                    return await this.runApp(input, logs);
                default:
                    return { ok: false, error: `Unknown action: ${action}`, logs };
            }
        } catch (e: any) {
            logs.push(`❌ Error: ${e.message}`);
            return { ok: false, error: e.message, logs };
        }
    }

    private async initProject(input: any, logs: string[]) {
        const projectName = input.projectName || 'my-mobile-app';
        const outputDir = input.outputDir || process.cwd();
        const template = input.template || 'tabs';
        const platform = input.platform || 'expo';

        logs.push(`📱 MobileBuilder: Initializing ${platform} project "${projectName}"`);

        const projectPath = path.join(outputDir, projectName);

        if (platform === 'expo') {
            // Create Expo project structure
            if (!fs.existsSync(projectPath)) {
                fs.mkdirSync(projectPath, { recursive: true });
            }

            // Generate package.json
            const packageJson = {
                name: projectName,
                version: '1.0.0',
                main: 'node_modules/expo/AppEntry.js',
                scripts: {
                    start: 'expo start',
                    android: 'expo start --android',
                    ios: 'expo start --ios',
                    web: 'expo start --web',
                    build: 'eas build',
                    'build:android': 'eas build --platform android',
                    'build:ios': 'eas build --platform ios'
                },
                dependencies: {
                    'expo': '~49.0.0',
                    'expo-status-bar': '~1.6.0',
                    'react': '18.2.0',
                    'react-native': '0.72.0',
                    '@react-navigation/native': '^6.1.0',
                    '@react-navigation/native-stack': '^6.9.0',
                    '@react-navigation/bottom-tabs': '^6.5.0',
                    'react-native-screens': '~3.22.0',
                    'react-native-safe-area-context': '4.6.3'
                },
                devDependencies: {
                    '@babel/core': '^7.20.0',
                    '@types/react': '~18.2.14',
                    'typescript': '^5.1.0'
                }
            };

            fs.writeFileSync(
                path.join(projectPath, 'package.json'),
                JSON.stringify(packageJson, null, 2)
            );

            // Generate App.tsx with navigation based on template
            const appContent = this.generateAppWithNavigation(template);
            fs.writeFileSync(path.join(projectPath, 'App.tsx'), appContent);

            // Create screens directory
            const screensDir = path.join(projectPath, 'screens');
            fs.mkdirSync(screensDir, { recursive: true });

            // Generate default screens based on template
            const screens = template === 'tabs' ? ['Home', 'Settings', 'Profile'] : ['Home', 'Details'];
            for (const screen of screens) {
                const screenContent = this.generateScreen(screen);
                fs.writeFileSync(path.join(screensDir, `${screen}Screen.tsx`), screenContent);
            }

            // Generate tsconfig.json
            const tsconfig = {
                extends: 'expo/tsconfig.base',
                compilerOptions: {
                    strict: true,
                    baseUrl: '.',
                    paths: { '@/*': ['./*'] }
                }
            };
            fs.writeFileSync(
                path.join(projectPath, 'tsconfig.json'),
                JSON.stringify(tsconfig, null, 2)
            );

            // Generate app.json
            const appJson = {
                expo: {
                    name: projectName,
                    slug: projectName.toLowerCase().replace(/\s+/g, '-'),
                    version: '1.0.0',
                    orientation: 'portrait',
                    icon: './assets/icon.png',
                    splash: {
                        image: './assets/splash.png',
                        resizeMode: 'contain',
                        backgroundColor: '#ffffff'
                    },
                    ios: { supportsTablet: true },
                    android: { adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#ffffff' } },
                    web: { favicon: './assets/favicon.png' }
                }
            };
            fs.writeFileSync(
                path.join(projectPath, 'app.json'),
                JSON.stringify(appJson, null, 2)
            );

            // Create assets directory
            fs.mkdirSync(path.join(projectPath, 'assets'), { recursive: true });

            logs.push(`✅ Created Expo project at ${projectPath}`);
            logs.push(`📦 Run: cd ${projectName} && npm install && npx expo start`);

            return {
                ok: true,
                output: {
                    success: true,
                    projectPath,
                    files: [
                        'package.json',
                        'App.tsx',
                        'tsconfig.json',
                        'app.json',
                        ...screens.map(s => `screens/${s}Screen.tsx`)
                    ],
                    commands: [
                        `cd ${projectName}`,
                        'npm install',
                        'npx expo start'
                    ]
                },
                logs
            };
        } else {
            // React Native CLI init
            logs.push(`🔧 Generating React Native CLI project scaffold...`);
            return {
                ok: true,
                output: {
                    success: true,
                    commands: [`npx react-native init ${projectName} --template react-native-template-typescript`]
                },
                logs
            };
        }
    }

    private async addScreen(input: any, logs: string[]) {
        const screenName = input.screenName || 'NewScreen';
        const outputDir = input.outputDir || './screens';

        const screenPath = path.join(outputDir, `${screenName}Screen.tsx`);
        const content = this.generateScreen(screenName);

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(screenPath, content);
        logs.push(`✅ Created screen: ${screenPath}`);

        return {
            ok: true,
            output: { success: true, files: [screenPath] },
            logs
        };
    }

    private async addNavigation(input: any, logs: string[]) {
        const template = input.template || 'stack';
        const outputDir = input.outputDir || './navigation';

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const navContent = this.generateNavigator(template);
        const navPath = path.join(outputDir, 'Navigator.tsx');
        fs.writeFileSync(navPath, navContent);

        logs.push(`✅ Created ${template} navigator: ${navPath}`);

        return {
            ok: true,
            output: { success: true, files: [navPath] },
            logs
        };
    }

    private async addStateManagement(input: any, logs: string[]) {
        const stateManager = input.stateManager || 'zustand';
        const outputDir = input.outputDir || './store';

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const storeContent = this.generateStore(stateManager);
        const storePath = path.join(outputDir, 'index.ts');
        fs.writeFileSync(storePath, storeContent);

        logs.push(`✅ Created ${stateManager} store: ${storePath}`);

        return {
            ok: true,
            output: {
                success: true,
                files: [storePath],
                dependencies: stateManager === 'zustand' ? ['zustand'] :
                    stateManager === 'redux' ? ['@reduxjs/toolkit', 'react-redux'] :
                        stateManager === 'jotai' ? ['jotai'] : []
            },
            logs
        };
    }

    private async buildApp(input: any, logs: string[]) {
        logs.push(`📦 Build command: npx eas build --platform all`);
        return {
            ok: true,
            output: {
                commands: [
                    'npx eas build --platform android',
                    'npx eas build --platform ios'
                ]
            },
            logs
        };
    }

    private async runApp(input: any, logs: string[]) {
        logs.push(`▶️ Run command: npx expo start`);
        return {
            ok: true,
            output: { commands: ['npx expo start'] },
            logs
        };
    }

    private generateAppWithNavigation(template: string): string {
        if (template === 'tabs') {
            return `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './screens/HomeScreen';
import SettingsScreen from './screens/SettingsScreen';
import ProfileScreen from './screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <StatusBar style="auto" />
            <Tab.Navigator>
                <Tab.Screen name="Home" component={HomeScreen} />
                <Tab.Screen name="Settings" component={SettingsScreen} />
                <Tab.Screen name="Profile" component={ProfileScreen} />
            </Tab.Navigator>
        </NavigationContainer>
    );
}
`;
        }

        return `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './screens/HomeScreen';
import DetailsScreen from './screens/DetailsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <StatusBar style="auto" />
            <Stack.Navigator>
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Details" component={DetailsScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
`;
    }

    private generateScreen(name: string): string {
        return `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ${name}Screen() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>${name}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
    },
});
`;
    }

    private generateNavigator(template: string): string {
        return `import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
    return (
        <Stack.Navigator>
            {/* Add your screens here */}
        </Stack.Navigator>
    );
}
`;
    }

    private generateStore(manager: string): string {
        if (manager === 'zustand') {
            return `import { create } from 'zustand';

interface AppState {
    count: number;
    user: { name: string; email: string } | null;
    increment: () => void;
    decrement: () => void;
    setUser: (user: { name: string; email: string } | null) => void;
}

export const useStore = create<AppState>((set) => ({
    count: 0,
    user: null,
    increment: () => set((state) => ({ count: state.count + 1 })),
    decrement: () => set((state) => ({ count: state.count - 1 })),
    setUser: (user) => set({ user }),
}));
`;
        }

        if (manager === 'redux') {
            return `import { configureStore, createSlice } from '@reduxjs/toolkit';

const appSlice = createSlice({
    name: 'app',
    initialState: {
        count: 0,
        user: null as { name: string; email: string } | null,
    },
    reducers: {
        increment: (state) => { state.count += 1; },
        decrement: (state) => { state.count -= 1; },
        setUser: (state, action) => { state.user = action.payload; },
    },
});

export const { increment, decrement, setUser } = appSlice.actions;

export const store = configureStore({
    reducer: { app: appSlice.reducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
`;
        }

        return `import React, { createContext, useContext, useState } from 'react';

interface AppState {
    count: number;
    user: { name: string; email: string } | null;
}

const AppContext = createContext<{
    state: AppState;
    increment: () => void;
    decrement: () => void;
    setUser: (user: AppState['user']) => void;
} | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AppState>({ count: 0, user: null });

    return (
        <AppContext.Provider value={{
            state,
            increment: () => setState(s => ({ ...s, count: s.count + 1 })),
            decrement: () => setState(s => ({ ...s, count: s.count - 1 })),
            setUser: (user) => setState(s => ({ ...s, user })),
        }}>
            {children}
        </AppContext.Provider>
    );
}

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
};
`;
    }
}
