import React, { useState } from 'react';
import { Delete, Divide, Minus, Plus, X } from 'lucide-react';

const App = () => {
    const [display, setDisplay] = useState('0');
    const [equation, setEquation] = useState('');

    const handleNumber = (n: string) => {
        if (display === '0') setDisplay(n);
        else setDisplay(display + n);
    };

    const handleOperator = (op: string) => {
        setEquation(display + ' ' + op + ' ');
        setDisplay('0');
    };

    const calculate = () => {
        try {
            const result = eval(equation + display);
            setDisplay(String(result));
            setEquation('');
        } catch {
            setDisplay('Error');
        }
    };

    const clear = () => {
        setDisplay('0');
        setEquation('');
    };

    const btnClass = "w-16 h-16 flex items-center justify-center rounded-2xl text-xl font-bold transition-all active:scale-95";
    const numClass = `${btnClass} bg-zinc-900 text-white hover:bg-zinc-800`;
    const opClass = `${btnClass} bg-orange-500 text-white hover:bg-orange-400`;
    const utilClass = `${btnClass} bg-zinc-700 text-white hover:bg-zinc-600`;

    return (
        <div style={{ background: '#000', padding: '2rem', borderRadius: '3rem', border: '1px solid #333', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
                <div style={{ color: '#666', fontSize: '0.8rem', height: '1.2rem' }}>{equation}</div>
                <div style={{ color: '#fff', fontSize: '3rem', fontWeight: 'bold' }}>{display}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <button onClick={clear} className={utilClass}>AC</button>
                <button onClick={() => setDisplay(String(Number(display) * -1))} className={utilClass}>+/-</button>
                <button onClick={() => setDisplay(String(Number(display) / 100))} className={utilClass}>%</button>
                <button onClick={() => handleOperator('/')} className={opClass}><Divide size={24} /></button>

                <button onClick={() => handleNumber('7')} className={numClass}>7</button>
                <button onClick={() => handleNumber('8')} className={numClass}>8</button>
                <button onClick={() => handleNumber('9')} className={numClass}>9</button>
                <button onClick={() => handleOperator('*')} className={opClass}><X size={24} /></button>

                <button onClick={() => handleNumber('4')} className={numClass}>4</button>
                <button onClick={() => handleNumber('5')} className={numClass}>5</button>
                <button onClick={() => handleNumber('6')} className={numClass}>6</button>
                <button onClick={() => handleOperator('-')} className={opClass}><Minus size={24} /></button>

                <button onClick={() => handleNumber('1')} className={numClass}>1</button>
                <button onClick={() => handleNumber('2')} className={numClass}>2</button>
                <button onClick={() => handleNumber('3')} className={numClass}>3</button>
                <button onClick={() => handleOperator('+')} className={opClass}><Plus size={24} /></button>

                <button onClick={() => handleNumber('0')} className={`${numClass} col-span-2 w-full text-left pl-6`} style={{ gridColumn: 'span 2' }}>0</button>
                <button onClick={() => handleNumber('.')} className={numClass}>.</button>
                <button onClick={calculate} className={opClass}>=</button>
            </div>

            <style>{`
                .col-span-2 { grid-column: span 2; width: 100% !important; }
                button { border: none; cursor: pointer; outline: none; }
                .transition-all { transition: all 0.2s ease; }
                .active\\:scale-95:active { transform: scale(0.95); }
                .rounded-2xl { border-radius: 1rem; }
                .bg-zinc-900 { background: #18181b; }
                .bg-zinc-800 { background: #27272a; }
                .bg-zinc-700 { background: #3f3f46; }
                .bg-orange-500 { background: #f97316; }
                .bg-orange-400 { background: #fb923c; }
                .hover\\:bg-zinc-800:hover { background: #27272a; }
                .text-white { color: #fff; }
                .font-bold { font-weight: 700; }
                .text-xl { font-size: 1.25rem; }
                .w-16 { width: 4rem; }
                .h-16 { height: 4rem; }
            `}</style>
        </div>
    );
};

export default App;
