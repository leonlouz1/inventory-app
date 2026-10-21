import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Table, Typography } from "antd";
import { costsApi } from "../api/inventory";
import { margin, sourcingCost, usd } from "../utils/landedCost";
import MarginTag from "./MarginTag";

// Landed cost and margin for one product: each origin it's made in, to each
// port, with and without warehouse delivery (FOB port orders skip it).
export default function ProductCostCard({ product }) {
  const [rates, setRates] = useState(null);
  const [sourcing, setSourcing] = useState(null);

  useEffect(() => {
    Promise.all([costsApi.rates(), costsApi.productCosts(product.id)])
      .then(([r, s]) => { setRates(r); setSourcing(s); })
      .catch(() => setSourcing([]));
  }, [product.id]);

  const rows = rates && sourcing
    ? sourcing.flatMap((s) => rates.destinations.map((d) => {
        const withWh = sourcingCost(s, rates, d.id, true).total;
        const fob = sourcingCost(s, rates, d.id, false).total;
        return { key: `${s.originId}-${d.id}`, origin: s.originName, destination: d.name, withWh, fob, s };
      }))
    : [];

  return (
    <Card
      size="small"
      title="Landed cost & margin"
      extra={<Link to="/costs">Costs page</Link>}
      style={{ marginBottom: 16 }}
      loading={!sourcing}
    >
      {sourcing && sourcing.length === 0 ? (
        <Typography.Text type="secondary">
          No costs entered for {product.sku} yet. Add its factory price, duty and units per container on the{" "}
          <Link to="/costs">Costs page</Link>.
        </Typography.Text>
      ) : (
        <Table
          size="small"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: "Made in", dataIndex: "origin" },
            { title: "Ship to", dataIndex: "destination" },
            {
              title: "Landed (warehouse)",
              dataIndex: "withWh",
              align: "right",
              render: (v) => <span>{usd(v, 3)} <MarginTag value={margin(product.wholesalePrice, v)} /></span>,
            },
            {
              title: "Landed (FOB port)",
              dataIndex: "fob",
              align: "right",
              render: (v) => <span>{usd(v, 3)} <MarginTag value={margin(product.wholesalePrice, v)} /></span>,
            },
            {
              title: "Factory · duty · units/ctr",
              key: "inputs",
              render: (_, r) => (
                <span style={{ color: "#8c8c8c" }}>
                  {usd(r.s.factoryPrice, 3)} · {Number(r.s.dutyRate) + Number(r.s.extraDutyRate)}% · {r.s.unitsPerContainer}
                </span>
              ),
            },
          ]}
        />
      )}
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
        Margins against wholesale {usd(product.wholesalePrice)}.
      </Typography.Paragraph>
    </Card>
  );
}
