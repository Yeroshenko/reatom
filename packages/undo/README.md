This package have a set of methods to handle a state history for an atom or a set of atoms. Useful for complex forms, WYSIWYG and so on.

## Installation

```sh
npm i @reatom/undo
```

## Usage

All methods reuse `WithUndo` interface which includes the following atoms and actions.

- `jump` action allows you to navigate entire history by passed index.
- `undo` action is a shortcut to `jump(ctx, -1)`.
- `redo` action is a shortcut to `jump(ctx, +1)`.
- `clearHistory` action clear the whole history.
- `isUndoAtom` atom with a boolean state which represent the current position (is it possible to do "undo").
- `isRedoAtom` atom with a boolean state which represent the current position (is it possible to do "redo").
- `positionAtom` atom with a number state which represent the index of current history position.
- `historyAtom` atom with a list of states, it could help you to know the size of the history. You shouldn't change it by yourself!

### withUndo

`withUndo` adds extra methods for an existing atom to handle the state history and navigate through it. Have an not required `length` option.

```ts
import { atom } from '@reatom/core'
import { withUndo } from '@reatom/undo'

const inputAtom = atom('').pipe(withUndo(/* { length = 30 } */))
```

### reatomUndo

`reatomUndo` create a computed atom, which collect the states of passed atoms and manage it in a single history line. You could read the state of resulted atom as a snapshot of all states of passed atoms.

```ts
import { atom } from '@reatom/core'
import { reatomUndo } from '@reatom/undo'

const formUndoAtom = reatomUndo([emailAtom, passwordAtom])
```

### reatomDynamicUndo

`reatomDynamicUndo` accept a callback to spy a dynamic list of atoms and manage their in a single history line. `parseAtoms` could help you with it. Resulted atom have no useful state, but all 

```ts
import { atom } from '@reatom/core'
import { reatomUndo } from '@reatom/undo'

const listUndoAtom = reatomDynamicUndo((ctx) => {
  parseAtom(ctx, listAtom)
})
```
