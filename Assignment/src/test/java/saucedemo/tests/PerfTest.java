//package saucedemo.tests;
//
//import com.google.gson.JsonObject;
//import com.microsoft.playwright.CDPSession;
//import org.junit.jupiter.params.ParameterizedTest;
//import org.junit.jupiter.params.provider.CsvFileSource;
//import saucedemo.base.Setup;
//import saucedemo.pages.InventoryPage;
//import saucedemo.pages.LoginPage;
//
//import java.util.List;
//import java.util.Map;
//
//public class PerfTest extends Setup {
//
//    @ParameterizedTest
//    @CsvFileSource(resources = "/testData/perf.csv", numLinesToSkip = 1)
//    public void purchase(String testId, String scenario, String username, String password) {
//        //Create a new CDP session for the page to enable performance measures
//        CDPSession client = browserContext.newCDPSession(page);
//
//        //Record Performance metrics
//        client.send("Performance.enable");
//        // Create a fresh isolated context and page for every row
//        LoginPage loginPage = new LoginPage();
//        InventoryPage inventoryPage = new InventoryPage();
//
//        loginPage.performLogin(page, username, password);
//        inventoryPage.addItem(page);
//        inventoryPage.goToCartPage(page);
//        inventoryPage.checkout(page);
//        inventoryPage.finish(page);
//
//        // Call Performance.getMetrics
//        Object result = client.send("Performance.getMetrics", null);
//
//        Map<String, Object> metrics = (Map<String, Object>) result;
//
//        List<Map<String, Object>> metricList =
//                (List<Map<String, Object>>) metrics.get("metrics");
//
//        for (Map<String, Object> metric : metricList) {
//            String name = (String) metric.get("name");
//            Object value = metric.get("value");
//            System.out.println(name + " = " + value);
//        }
//    }
//}
