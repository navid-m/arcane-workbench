import * as d3 from "d3";

export interface BucketNode {
  id: string;
  name: string;
  fields: Array<{ name: string; type: string }>;
  recordCount?: number;
  records?: Array<Record<string, any>>;
  type?: "bucket" | "record";
  data?: Record<string, any>;
  bucketName?: string;
}

export interface BucketLink {
  source: string;
  target: string;
  type: "reference" | "related" | "contains";
}

export interface GraphData {
  nodes: BucketNode[];
  links: BucketLink[];
}

export class BucketGraphView {
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private container: HTMLElement;
  private simulation: d3.Simulation<
    d3.SimulationNodeDatum & BucketNode,
    d3.SimulationLinkDatum<d3.SimulationNodeDatum & BucketNode>
  > | null = null;
  private width: number = 0;
  private height: number = 0;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private onNodeClick?: (node: BucketNode) => void;

  constructor(containerId: string, onNodeClick?: (node: BucketNode) => void) {
    this.container = document.getElementById(containerId)!;
    this.onNodeClick = onNodeClick;
    this.svg = d3
      .select(`#${containerId}`)
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%");

    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event: { transform: any }) => {
        this.svg.select("g").attr("transform", event.transform);
      });

    this.svg.call(this.zoom);
    this.updateDimensions();
    window.addEventListener("resize", () => this.updateDimensions());
  }

  private updateDimensions(): void {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.svg.attr("width", this.width).attr("height", this.height);
  }

  render(data: GraphData): void {
    this.svg.selectAll("*").remove();

    const g = this.svg.append("g");

    const nodes = data.nodes.map((d) => ({ ...d }));
    const links = data.links.map((d) => ({ ...d }));

    this.simulation = d3
      .forceSimulation(nodes as any)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance((d: any) => (d.type === "contains" ? 80 : 150)),
      )
      .force(
        "charge",
        d3
          .forceManyBody()
          .strength((d: any) => (d.type === "bucket" ? -800 : -200)),
      )
      .force("center", d3.forceCenter(this.width / 2, this.height / 2))
      .force(
        "collision",
        d3.forceCollide().radius((d: any) => (d.type === "bucket" ? 60 : 30)),
      );

    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d: any) =>
        d.type === "contains" ? "#58a6ff" : "#30363d",
      )
      .attr("stroke-width", (d: any) => (d.type === "contains" ? 1.5 : 2))
      .attr("stroke-opacity", (d: any) => (d.type === "contains" ? 0.4 : 0.6));

    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(
        d3
          .drag<SVGGElement, any>()
          .on("start", (event: any, d: any) => this.dragStarted(event, d))
          .on("drag", (event: any, d: any) => this.dragged(event, d))
          .on("end", (event: any, d: any) => this.dragEnded(event, d)),
      );

    node
      .append("circle")
      .attr("r", (d: any) => (d.type === "bucket" ? 40 : 20))
      .attr("fill", (d: any) => (d.type === "bucket" ? "#ff5370" : "#89ddff"))
      .attr("fill-opacity", 0.2)
      .attr("stroke", (d: any) => (d.type === "bucket" ? "#ff5370" : "#89ddff"))
      .attr("stroke-width", 2)
      .attr("cursor", "pointer")
      .on("click", (event: { stopPropagation: () => void }, d: BucketNode) => {
        event.stopPropagation();
        if (this.onNodeClick) {
          this.onNodeClick(d);
        }
      })
      .on("mouseenter", function () {
        d3.select(this).attr("fill-opacity", 0.4);
      })
      .on("mouseleave", function () {
        d3.select(this).attr("fill-opacity", 0.2);
      });

    node
      .append("text")
      .text((d: { name: any }) => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d: any) => (d.type === "bucket" ? -5 : 4))
      .attr("fill", "#e6edf3")
      .attr("font-size", (d: any) => (d.type === "bucket" ? "13px" : "10px"))
      .attr("font-weight", (d: any) => (d.type === "bucket" ? "600" : "400"))
      .attr("pointer-events", "none");

    node
      .filter((d: any) => d.type === "bucket")
      .append("text")
      .text((d: { fields: string | any[] }) => `${d.fields.length} fields`)
      .attr("text-anchor", "middle")
      .attr("dy", 10)
      .attr("fill", "#8b949e")
      .attr("font-size", "10px")
      .attr("pointer-events", "none");

    node
      .filter((d: any) => d.type === "bucket")
      .append("text")
      .text((d: { recordCount: undefined }) =>
        d.recordCount !== undefined ? `${d.recordCount} records` : "",
      )
      .attr("text-anchor", "middle")
      .attr("dy", 22)
      .attr("fill", "#8b949e")
      .attr("font-size", "9px")
      .attr("pointer-events", "none");

    node
      .append("title")
      .text(
        (d: {
          type: string;
          data: { [s: string]: unknown } | ArrayLike<unknown>;
          name: any;
          fields: any[];
        }) => {
          if (d.type === "record" && d.data) {
            const entries = Object.entries(d.data)
              .filter(([key]) => key !== "__hash__")
              .map(([key, value]) => `  ${key}: ${value}`)
              .join("\n");
            return `${d.name}\n\n${entries}`;
          } else {
            const fieldList = d.fields
              .map((f: { name: any; type: any }) => `  ${f.name}: ${f.type}`)
              .join("\n");
            return `${d.name}\n\nFields:\n${fieldList}`;
          }
        },
      );

    this.simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });
  }

  private dragStarted(event: any, d: any): void {
    if (!event.active) this.simulation?.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  private dragged(event: any, d: any): void {
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragEnded(event: any, d: any): void {
    if (!event.active) this.simulation?.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  centerView(): void {
    this.svg
      .transition()
      .duration(750)
      .call(
        this.zoom.transform as any,
        d3.zoomIdentity.translate(this.width / 2, this.height / 2).scale(1),
      );
  }

  destroy(): void {
    this.simulation?.stop();
    this.svg.selectAll("*").remove();
  }
}
