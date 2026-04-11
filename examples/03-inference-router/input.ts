/// <reference path="../../internal/testfixtures/runtypes.d.ts" />
export {};
const sayHello = (name: string): string => "Hello " + name;
const sum = (a: number, b: number) => a + b;
const routes = { sayHello, sum };
const myAPI = router(routes);
