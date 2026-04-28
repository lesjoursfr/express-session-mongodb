import assert from "assert";
import express, { NextFunction, Request, Response } from "express";
import http from "http";
import superagent from "superagent";
import { ensureLoggedIn, ensureLoggedOut } from "../../src/index.js";

type UserData = { uid: number; name: string };
type RequestWithUser = Request & { user?: UserData } & { isAuthenticated?: () => boolean };

describe("ensureLoggedIn", function () {
  let server: http.Server;

  afterEach(async function () {
    server?.close();
  });

  it("can redirect unauthenticated users to the login page", async function () {
    let user: UserData | undefined;

    const app = express();
    app.use(function (req: RequestWithUser, _res: Response, next: NextFunction) {
      req.user = user; // Set the dummy user if there is one
      next();
    });

    app.get("/", function (req: RequestWithUser, res: Response) {
      res.send("Hello " + (req.user ? req.user.name : "Guest"));
    });

    app.get("/login-page", function (_req: Request, res: Response) {
      res.send("Login page");
    });

    app.post("/login-page", function (_req: Request, res: Response) {
      // Dummy user object
      user = { uid: 1, name: "Test User" };
      res.redirect("/protected-page");
    });

    app.get("/protected-page", ensureLoggedIn("/login-page"), function (_req: Request, res: Response) {
      res.send("Protected content");
    });

    server = app.listen(3000);

    let response = await superagent.get("http://127.0.0.1:3000/");
    assert.equal(200, response.status);
    assert.equal("Hello Guest", response.text);

    response = await superagent.get("http://127.0.0.1:3000/protected-page");
    assert.equal(200, response.status);
    assert.equal("Login page", response.text);
    assert.equal("http://127.0.0.1:3000/login-page", response.redirects[0]);

    response = await superagent.post("http://127.0.0.1:3000/login-page").send({ username: "test", password: "test" });
    assert.equal(200, response.status);
    assert.equal("Protected content", response.text);
    assert.equal("http://127.0.0.1:3000/protected-page", response.redirects[0]);
  });

  it("can use the existing isAuthenticated method on the request object", async function () {
    let user: UserData = { uid: -1, name: "Wrong User" };

    const app = express();
    app.use(function (req: RequestWithUser, _res: Response, next: NextFunction) {
      req.user = user; // Set the dummy user if there is one
      req.isAuthenticated = function () {
        return req.user?.uid === 1;
      };
      next();
    });

    app.get("/login-page", function (_req: Request, res: Response) {
      res.send("Login page");
    });

    app.get("/protected-page", ensureLoggedIn("/login-page"), function (_req: Request, res: Response) {
      res.send("Protected content");
    });

    server = app.listen(3000);

    let response = await superagent.get("http://127.0.0.1:3000/protected-page");
    assert.equal(200, response.status);
    assert.equal("Login page", response.text);
    assert.equal("http://127.0.0.1:3000/login-page", response.redirects[0]);

    user = { uid: 1, name: "Test User" };

    response = await superagent.get("http://127.0.0.1:3000/protected-page");
    assert.equal(200, response.status);
    assert.equal("Protected content", response.text);
    assert.equal(0, response.redirects.length);
  });

  it("can use options object", async function () {
    let user: UserData | undefined = undefined;

    const app = express();
    app.use(function (req: RequestWithUser, _res: Response, next: NextFunction) {
      req.user = user; // Set the dummy user if there is one
      next();
    });

    app.get("/login-page", function (_req: Request, res: Response) {
      res.send("Login page");
    });

    app.get("/protected-page", ensureLoggedIn({ redirectTo: "/login-page" }), function (_req: Request, res: Response) {
      res.send("Protected content");
    });

    server = app.listen(3000);

    let response = await superagent.get("http://127.0.0.1:3000/protected-page");
    assert.equal(200, response.status);
    assert.equal("Login page", response.text);
    assert.equal("http://127.0.0.1:3000/login-page", response.redirects[0]);

    user = { uid: 1, name: "Test User" };

    response = await superagent.get("http://127.0.0.1:3000/protected-page");
    assert.equal(200, response.status);
    assert.equal("Protected content", response.text);
    assert.equal(0, response.redirects.length);
  });
});

describe("ensureLoggedOut", function () {
  let server: http.Server;

  afterEach(async function () {
    server?.close();
  });

  it("can redirect authenticated users to the protected page", async function () {
    let user: UserData | undefined = undefined;

    const app = express();
    app.use(function (req: RequestWithUser, _res: Response, next: NextFunction) {
      req.user = user; // Set the dummy user if there is one
      next();
    });

    app.get("/login-page", ensureLoggedOut("/protected-page"), function (_req: Request, res: Response) {
      res.send("Login page");
    });

    app.get("/protected-page", function (_req: Request, res: Response) {
      res.send("Protected content");
    });

    server = app.listen(3000);

    let response = await superagent.get("http://127.0.0.1:3000/login-page");
    assert.equal(200, response.status);
    assert.equal("Login page", response.text);
    assert.equal(0, response.redirects.length);

    user = { uid: 1, name: "Test User" };

    response = await superagent.get("http://127.0.0.1:3000/login-page");
    assert.equal(200, response.status);
    assert.equal("Protected content", response.text);
    assert.equal("http://127.0.0.1:3000/protected-page", response.redirects[0]);
  });

  it("can use the existing isAuthenticated method on the request object", async function () {
    let user: UserData = { uid: -1, name: "Wrong User" };

    const app = express();
    app.use(function (req: RequestWithUser, _res: Response, next: NextFunction) {
      req.user = user; // Set the dummy user if there is one
      req.isAuthenticated = function () {
        return req.user?.uid === 1;
      };
      next();
    });

    app.get("/login-page", ensureLoggedOut("/protected-page"), function (_req: Request, res: Response) {
      res.send("Login page");
    });

    app.get("/protected-page", function (_req: Request, res: Response) {
      res.send("Protected content");
    });

    server = app.listen(3000);

    let response = await superagent.get("http://127.0.0.1:3000/login-page");
    assert.equal(200, response.status);
    assert.equal("Login page", response.text);
    assert.equal(0, response.redirects.length);

    user = { uid: 1, name: "Test User" };

    response = await superagent.get("http://127.0.0.1:3000/login-page");
    assert.equal(200, response.status);
    assert.equal("Protected content", response.text);
    assert.equal("http://127.0.0.1:3000/protected-page", response.redirects[0]);
  });

  it("can use options object", async function () {
    let user: UserData | undefined = undefined;

    const app = express();
    app.use(function (req: RequestWithUser, _res: Response, next: NextFunction) {
      req.user = user; // Set the dummy user if there is one
      next();
    });

    app.get("/login-page", ensureLoggedOut({ redirectTo: "/protected-page" }), function (_req: Request, res: Response) {
      res.send("Login page");
    });

    app.get("/protected-page", function (_req: Request, res: Response) {
      res.send("Protected content");
    });

    server = app.listen(3000);

    let response = await superagent.get("http://127.0.0.1:3000/login-page");
    assert.equal(200, response.status);
    assert.equal("Login page", response.text);
    assert.equal(0, response.redirects.length);

    user = { uid: 1, name: "Test User" };

    response = await superagent.get("http://127.0.0.1:3000/login-page");
    assert.equal(200, response.status);
    assert.equal("Protected content", response.text);
    assert.equal("http://127.0.0.1:3000/protected-page", response.redirects[0]);
  });
});
