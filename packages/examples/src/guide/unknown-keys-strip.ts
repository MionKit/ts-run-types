import {createStripUnknownKeys} from '@ts-runtypes/core';

type User = {id: number; name: string};

// createStripUnknownKeys -> deletes undeclared keys in place, returns the same ref.
const strip = createStripUnknownKeys<User>();

const dirty = {id: 1, name: 'Ada', admin: true, token: 'secret'};
strip(dirty); // {id: 1, name: 'Ada'} — admin and token are gone

export {strip};
