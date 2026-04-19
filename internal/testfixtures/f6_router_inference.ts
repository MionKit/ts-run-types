/// <reference path="./runtypes.d.ts" />
export {};
const sayHello = (name: string): string => "Hello " + name;
const routes = { sayHello };
const myAPI = router(routes);
