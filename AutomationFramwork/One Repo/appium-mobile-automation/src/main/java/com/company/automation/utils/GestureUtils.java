package com.company.automation.utils;

import com.company.automation.driver.DriverManager;
import java.time.Duration;
import java.util.List;
import org.openqa.selenium.Dimension;
import org.openqa.selenium.interactions.Interactive;
import org.openqa.selenium.interactions.PointerInput;
import org.openqa.selenium.interactions.Sequence;

/** W3C Actions-based gestures (swipe/scroll) that work across Android and iOS. */
public final class GestureUtils {

    private GestureUtils() {}

    public enum Direction {
        UP,
        DOWN,
        LEFT,
        RIGHT
    }

    public static void swipe(Direction direction) {
        Dimension size = DriverManager.getDriver().manage().window().getSize();
        int startX = size.width / 2;
        int startY = size.height / 2;
        int endX = startX;
        int endY = startY;

        switch (direction) {
            case UP -> endY = (int) (size.height * 0.2);
            case DOWN -> endY = (int) (size.height * 0.8);
            case LEFT -> endX = (int) (size.width * 0.2);
            case RIGHT -> endX = (int) (size.width * 0.8);
        }

        PointerInput finger = new PointerInput(PointerInput.Kind.TOUCH, "finger");
        Sequence swipe = new Sequence(finger, 1);
        swipe.addAction(
                finger.createPointerMove(
                        Duration.ZERO, PointerInput.Origin.viewport(), startX, startY));
        swipe.addAction(finger.createPointerDown(PointerInput.MouseButton.LEFT.asArg()));
        swipe.addAction(
                finger.createPointerMove(
                        Duration.ofMillis(600), PointerInput.Origin.viewport(), endX, endY));
        swipe.addAction(finger.createPointerUp(PointerInput.MouseButton.LEFT.asArg()));

        ((Interactive) DriverManager.getDriver()).perform(List.of(swipe));
    }
}
