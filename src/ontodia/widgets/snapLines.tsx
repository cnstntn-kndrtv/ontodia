import * as React from 'react';

import { Vector } from '../diagram/geometry';
import { PaperWidgetProps, PaperArea } from '../diagram/paperArea';
import { DiagramModel } from '../diagram/model';
import { EventObserver } from '../viewUtils/events';
import { Dictionary } from '../data/model';
import { Element } from '../diagram/elements';
import { boundsOf } from '../diagram/geometry';

export const DEFAULT_MAGNET_RADIUS = 10;

export interface AffectiveLine {
    linePosition: number;
    elementOffset: number;
    distance: number;
};

export interface LinesOfElement {
    verticals: number[];
    horizontals: number[];
}

export interface SnapLinesProps extends PaperWidgetProps {
    model: DiagramModel;
    magnetRadius?: number;
}

export class SnapLines extends React.Component<SnapLinesProps, {active: boolean}> {
    private readonly listener = new EventObserver();

    private grid: {
        rows: Element[][],
        columns: Element[][],
    };
    private linesToRender: {horizontal: number, vertical: number};
    private target: Element;

    constructor(props: SnapLinesProps) {
        super(props);
        this.state = {active: false};
    }

    render() {
        if (this.state.active) {
            const snapLines = this.getSnapLineViews();
            if (snapLines) {
                return <div className='ontodia-snap-lines'>
                    {snapLines.verticalLine}
                    {snapLines.horizontalLine}
                </div>;
            }
        }
        return null;
    }

    private onDragElement = (element: Element) => {
        const magnetLines = this.getLinesOfElement(element);

        const horizontal = this.getBestLine(
            this.grid.rows, magnetLines.horizontals, this.props.magnetRadius,
        );

        const vertical = this.getBestLine(
            this.grid.columns, magnetLines.verticals, this.props.magnetRadius,
        );

        element.setPosition({
            x: element.position.x + (vertical ? vertical.elementOffset : 0),
            y: element.position.y + (horizontal ? horizontal.elementOffset : 0),
        });

        this.linesToRender = {
            vertical: (vertical ? vertical.linePosition : 0),
            horizontal: (horizontal ? horizontal.linePosition : 0),
        };
    }

    private getBestLine(gridArray: Element[][], magnetLines: number[], radius: number): AffectiveLine {
        const affectiveLines: AffectiveLine[] = [];
        const targetPosition = this.target.position;
        const magnetRadius = radius || DEFAULT_MAGNET_RADIUS;

        for (let i = 0; i < magnetRadius; i++) {
            for (const lineIndex of magnetLines) {
                if (gridArray[lineIndex - i]) {
                    affectiveLines.push({
                        linePosition: lineIndex - i,
                        elementOffset: -i,
                        distance: getMinDistance(gridArray[lineIndex - i]),
                    });
                }
                if (gridArray[lineIndex + i]) {
                    affectiveLines.push({
                        linePosition: lineIndex + i,
                        elementOffset: +i,
                        distance: getMinDistance(gridArray[lineIndex + i]),
                    });
                }
            }
        }

        const linesSortedByRating = affectiveLines.sort((a, b) => {
            const aRating = Math.abs(a.elementOffset) + a.distance;
            const bRating = Math.abs(b.elementOffset) + b.distance;

            if (aRating < bRating) {
                return -1;
            } else if (aRating > bRating) {
                return 1;
            } else {
                return 0;
            }
        });

        return linesSortedByRating[0];

        function getMinDistance(elements: Element[]): number {
            return Math.min(...elements.map((e: Element) => {
                return Math.sqrt(
                    Math.pow(e.position.x - targetPosition.x, 2) +
                    Math.pow(e.position.y - targetPosition.y, 2)
                );
            }));
        }
    }

    componentDidMount() {
        const {paperArea} = this.props;
        this.listener.listen(paperArea.events, 'onDragElementStart', (element: Element) => {
            this.target = element;
            this.createGrid();
            this.state.active = true;
            this.setState(this.state);
        });
        this.listener.listen(paperArea.events, 'onDragElement', ({source, previous}) => {
            this.onDragElement(source);
            this.forceUpdate();
        });
        this.listener.listen(paperArea.events, 'onDragElementEnd', (element: Element) => {
            this.target = undefined;
            this.grid = undefined;
            this.state.active = false;
            this.setState(this.state);
        });
    }

    private getSnapLineViews() {
        if (!this.linesToRender) {
            return null;
        }
        const bbox = boundsOf(this.target);

        let horizontalLine: JSX.Element;
        if (this.linesToRender.horizontal) {
            const {x, y} = this.props.paperArea
                .paperToScrollablePaneCoords(
                    bbox.x + (bbox.width / 2), this.linesToRender.horizontal
                );
            const style: React.CSSProperties = { left: `${x}px`, top: `${y}px`};
            horizontalLine = <div
                className='ontodia-snap-line ontodia-horizontal-snap-line'
                style={style}
            ></div>;
        } else {
            horizontalLine = null;
        }

        let verticalLine: JSX.Element;
        if (this.linesToRender.vertical) {
            const {x, y} = this.props.paperArea
                .paperToScrollablePaneCoords(
                    this.linesToRender.vertical, bbox.y + (bbox.height / 2)
                );
            const style: React.CSSProperties = { left: `${x}px`, top: `${y}px`};
            verticalLine = <div
                className='ontodia-snap-line ontodia-vertical-snap-line'
                style={style}
            ></div>;
        } else {
            verticalLine = null;
        }

        return {verticalLine, horizontalLine};
    }

    private createGrid = () => {
        this.grid = {
            columns: [],
            rows: [],
        };

        for (const element of this.props.model.elements) {
            if (element === this.target) { continue; }
            const linesOfElement = this.getLinesOfElement(element);

            for (const line of linesOfElement.verticals) {
                if (!this.grid.columns[line]) {
                    this.grid.columns[line] = [];
                }
                this.grid.columns[line].push(element);
            }
            for (const line of linesOfElement.horizontals) {
                if (!this.grid.rows[line]) {
                    this.grid.rows[line] = [];
                }
                this.grid.rows[line].push(element);
            }

        }
    }

    private getLinesOfElement(element: Element): LinesOfElement {
        const {x, y} = element.position;
        const width = element.size.width;
        const height = element.size.height;

        return {
            verticals: [
                Math.round(x + width / 2),
                Math.round(x),
                Math.round(x + width),
            ],
            horizontals: [
                Math.round(y + height / 2),
                Math.round(y),
                Math.round(y + height),
            ]
        };
    }
}
