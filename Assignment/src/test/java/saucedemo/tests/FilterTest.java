package saucedemo.tests;

import saucedemo.base.BrowserSetup;
import saucedemo.config.ConfigReader;

public class FilterTest extends BrowserSetup {

    public void useFilter(){
        String url = ConfigReader.getProperty("url");
        page.navigate(url);
    }
}
