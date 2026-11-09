import { DatePicker, Input, Radio, Select, Typography } from "antd";
import { EnvironmentOutlined, LinkOutlined } from "@ant-design/icons";
import { MEETING_LOCATIONS } from "../../constants/crm";

const label = (text) => (
  <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 2 }}>{text}</Typography.Text>
);

// When, where and who for a meeting. `value` is the object from blankMeeting() (utils/crmMeetings).
// `attendeeOptions` are the buyer's colleagues at the retailer; `retailerAddress`
// fills in the address when "Buyer's office" is picked.
export default function MeetingFields({ value, onChange, attendeeOptions = [], teamNames = [], retailerAddress, size = "small" }) {
  const set = (fields) => onChange({ ...value, ...fields });

  function pickLocation(locationType) {
    set({
      locationType,
      ...(locationType === "Buyer's office" && !value.address && retailerAddress && { address: retailerAddress }),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
      <div>
        {label("Date & time")}
        <DatePicker
          size={size}
          showTime={{ format: "h:mm A", minuteStep: 15, use12Hours: true }}
          format="ddd MMM D, YYYY h:mm A"
          allowClear={false}
          value={value.startsAt}
          onChange={(d) => d && set({ startsAt: d })}
          style={{ width: 240 }}
        />
      </div>
      <div>
        {label("Where")}
        <Radio.Group
          size={size}
          optionType="button"
          buttonStyle="solid"
          value={value.locationType}
          onChange={(e) => pickLocation(e.target.value)}
          options={MEETING_LOCATIONS}
        />
      </div>
      {value.locationType === "Buyer's office" && (
        <Input
          size={size}
          prefix={<EnvironmentOutlined style={{ color: "#999" }} />}
          value={value.address}
          onChange={(e) => set({ address: e.target.value })}
          placeholder="Office address"
        />
      )}
      {value.locationType === "Online call" && (
        <Input
          size={size}
          prefix={<LinkOutlined style={{ color: "#999" }} />}
          value={value.link}
          onChange={(e) => set({ link: e.target.value })}
          placeholder="Meeting link (optional)"
        />
      )}
      {attendeeOptions.length > 0 && (
        <div>
          {label("Their attendees")}
          <Select
            size={size}
            mode="multiple"
            value={value.attendeeIds}
            onChange={(attendeeIds) => set({ attendeeIds })}
            options={attendeeOptions}
            optionFilterProp="label"
            placeholder="Others from their side (DMM, assistant…)"
            style={{ width: "100%" }}
          />
        </div>
      )}
      <div>
        {label("Our attendees")}
        <Select
          size={size}
          mode="tags"
          value={value.ourAttendees}
          onChange={(ourAttendees) => set({ ourAttendees })}
          options={teamNames.map((n) => ({ value: n, label: n }))}
          placeholder="Type a name and press Enter"
          tokenSeparators={[","]}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}
