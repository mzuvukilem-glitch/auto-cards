# API Testing

The framework supports **API testing** alongside UI testing, using Playwright's
built-in `APIRequestContext` — HTTP requests with no browser. This shares the same
tooling (JUnit 5, Allure, config, parallelism) so UI and API suites live together.

## How it's wired

| Piece | Location | Purpose |
|-------|----------|---------|
| `ApiManager` | `driver/api/` | ThreadLocal holder for `Playwright` + `APIRequestContext` |
| `ApiRequestFactory` | `driver/api/` | `init()` / `dispose()` — builds the context with base URL + headers |
| `UserService` | `api/` | Example service client (endpoints + request shapes) |
| `JsonUtils` | `utils/` | Jackson helpers: `toJson`, `parse`, `fromJson` |
| `BaseApiTest` | `test/base/` | `@BeforeEach`/`@AfterEach` lifecycle (no browser) |
| `UserApiTests` | `test/tests/api/` | Example tests (status, headers, schema, CRUD) |

Config keys (in `config.properties`, overridable with `-D`):

```properties
api.base.url=https://reqres.in   # API under test
api.timeout=30000                # request timeout (ms)
api.token=                       # optional bearer token (prefer -Dapi.token=... in CI)
```

## Why Playwright for API tests

- **No browser** — `APIRequestContext` performs raw HTTP; fast and light.
- **Same context can share cookies/auth** with the browser if you want hybrid
  flows (e.g. log in via API, then drive the UI).
- **One toolchain** — same JUnit 5 runner, Allure reporting, config, and parallel
  model as the UI tests. No extra HTTP library needed.

## The pattern

```
ApiTest (tests/api/)        Service client (api/)        APIRequestContext
──────────────────          ─────────────────────        ──────────────────
UserApiTests          ──►    UserService.getUser(2)  ──►  request.get("/api/users/2")
  asserts status/body          returns APIResponse
```

Tests assert on the `APIResponse`; the service client owns endpoint paths and
request bodies (the API equivalent of a Page Object).

## Writing an API test

1. **Add/extend a service client** in `src/main/.../api/`:

   ```java
   @Step("GET user {0}")
   public APIResponse getUser(int id) {
       return ApiManager.getRequest().get("/api/users/" + id);
   }

   @Step("POST create user '{0}'")
   public APIResponse createUser(String name, String job) {
       String body = JsonUtils.toJson(Map.of("name", name, "job", job));
       return ApiManager.getRequest().post("/api/users",
               RequestOptions.create().setData(body));
   }
   ```

2. **Write the test** extending `BaseApiTest`, tag it `@Tag("api")`:

   ```java
   @Tag("api")
   class UserApiTests extends BaseApiTest {
       private final UserService users = new UserService();

       @Test
       void getUserReturnsExpectedPayload() {
           APIResponse response = users.getUser(2);
           assertEquals(200, response.status());
           JsonNode body = JsonUtils.parse(response.text());
           assertEquals(2, body.path("data").path("id").asInt());
       }
   }
   ```

## What you can assert

| Check | Example |
|-------|---------|
| Status code | `assertEquals(200, response.status())` |
| 2xx helper | `assertTrue(response.ok())` |
| Header | `response.headers().get("content-type")` |
| Body (tree) | `JsonUtils.parse(response.text()).path("data").path("id").asInt()` |
| Body (typed) | `JsonUtils.fromJson(response.text(), User.class)` |
| Raw bytes | `response.body()` |

## Request options

`RequestOptions.create()` supports everything you need:

```java
RequestOptions.create()
    .setQueryParam("page", 2)                 // ?page=2
    .setHeader("X-Trace", "abc")              // per-request header
    .setData(JsonUtils.toJson(payload))       // JSON body
    .setTimeout(10_000);                      // per-request timeout
```

Verbs: `get`, `post`, `put`, `patch`, `delete`, `head`, and `fetch` for a generic
request.

## Running

```bash
# All API tests
mvn test -Dgroups=api

# API smoke only
mvn test -Dgroups="api & smoke"

# Point at a different API / pass a token
mvn test -Dgroups=api -Dapi.base.url=https://staging.example.com -Dapi.token=$TOKEN
```

API tests report into the same Allure output as UI tests (`@Step`, `@Description`,
`@Severity` all apply). See [REPORTING](REPORTING.md).

## Hybrid: API setup for UI tests

A common pattern is to create state via API (fast) and verify via UI:

```java
// In a UI test: seed data through the service, then drive the browser.
new UserService().createUser("Seed", "Tester");
openLogin().login(user, pass);   // UI continues from a known state
```

Keep the API context and the browser page in their own ThreadLocals (they already
are), so this stays parallel-safe.

See also: [WRITING_TESTS](WRITING_TESTS.md) · [CONFIGURATION](CONFIGURATION.md) · [REPORTING](REPORTING.md)
