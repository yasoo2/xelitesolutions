/**
 *  ONE IMPLEMENTATION, IMPORTED — NOT A SECOND COPY.
 *
 *  The Arabic shaper and the row reordering live in `api/src/core/text`, with
 *  the rest of this repository's pure text algorithms and, more to the point,
 *  inside the only suite that runs: `bash scripts/gate.sh` type-checks and
 *  tests `api/src`, and the web package has no test runner at all.
 *
 *  The temptation was to paste the tables here so the import stayed inside
 *  `web/`. That is the exact defect this repository keeps paying for — a layer
 *  keeping its own private answer to a question another layer already answers.
 *  Two shaping tables would disagree the first time one of them learned a
 *  letter, and only one of them would be under test.
 *
 *  So the path is ugly and the arrangement is honest. The ugliness is confined
 *  to this one line.
 */
export { shapeForTerminal } from '../../../api/src/core/text/arabic-terminal';
