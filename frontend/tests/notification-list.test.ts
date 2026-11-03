import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotificationList } from "../components/notification-list";

describe("NotificationList", () => {
  it("distinguishes an empty feed from a load failure", () => {
    const empty = renderToStaticMarkup(React.createElement(NotificationList, { notifications: [] }));
    const failed = renderToStaticMarkup(React.createElement(NotificationList, { notifications: [], loadFailed: true }));

    expect(empty).toContain("No notifications yet.");
    expect(failed).toContain("Notifications could not be loaded");
    expect(failed).toContain('role="alert"');
  });

  it("renders a booking notification", () => {
    const markup = renderToStaticMarkup(React.createElement(NotificationList, {
      notifications: [{
        id: "notification-1",
        type: "appointment_booked",
        title: "New appointment booked",
        message: "A patient booked a slot.",
        readAt: null,
        createdAt: new Date(),
        appointmentId: "appointment-1",
        href: "/patient/appointments/appointment-1/confirmation",
      }],
    }));

    expect(markup).toContain("New appointment booked");
    expect(markup).toContain("Booking");
  });
});
