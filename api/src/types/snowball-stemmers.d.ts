/**
 * The package ships no types. Declared here rather than reached for with
 * `any` at the call site: one typed surface, in the one file that uses it.
 */
declare module 'snowball-stemmers' {
    export interface Stemmer {
        stem(word: string): string;
    }
    export function newStemmer(language: string): Stemmer;
}
