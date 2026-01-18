import { Bell, Search, User } from 'lucide-react';

export function Header() {
    return (
        <header className="fixed top-0 right-0 left-64 h-16 bg-gray-900/50 backdrop-blur-md border-b border-gray-800 z-10">
            <div className="h-full px-6 flex items-center justify-between">
                {/* Search */}
                <div className="relative w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search logs, metrics, or alerts..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4">
                    <button className="relative p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                        <Bell className="w-5 h-5" />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                    </button>

                    <div className="flex items-center gap-3 pl-4 border-l border-gray-800">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium text-white">Admin User</p>
                            <p className="text-xs text-gray-400">admin@xelitesolutions.com</p>
                        </div>
                        <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
