import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { merge, clone } from 'lodash';
import { Element, Link } from '../diagram/elements';
import { DiagramModel } from '../diagram/model';
import { DiagramView } from '../diagram/view';
import { boundsOf } from '../diagram/geometry';
import {
    LayoutNode,
    LayoutLink,
    removeOverlaps,
    padded,
    translateToPositiveQuadrant,
    translateToCenter,
} from '../viewUtils/layout';
import { Dictionary } from '../../index';

export type LayoutFunction = (interactive: Dictionary<Parameter>) => void;
export type Parameter = StringParameter | NumericParameter | BooleanParameter;

export function isBooleanParamter(p: Parameter): p is BooleanParameter {
    return p.type === 'boolean';
}

export function isStringParamter(p: Parameter): p is StringParameter {
    return p.type === 'string';
}

export function isNumberParamter(p: Parameter): p is NumericParameter {
    return p.type === 'number';
}

export interface BooleanParameter {
    type: 'boolean';
    value: boolean;
    label: string;
}

export interface StringParameter {
    type: 'string';
    value?: string;
    label: string;
}

export interface NumericParameter {
    type: 'number';
    value: number;
    min: number;
    max: number;
    label: string;
}

export interface LayouAlgorithm {
    id: string;
    label?: string;
    icon?: string;
    supportAnimation?: boolean;
    layoutFunction: LayoutFunction;
    parameters?: Dictionary<Parameter>;
}

export interface LayoutAlgorithmManagerProps {
    algorithms: LayouAlgorithm[];
    state?: LayoutManagerState;
}

export interface LayoutManagerState {
    isExpanded?: boolean;
    selectedAlgorithm: LayouAlgorithm;
    interactive?: boolean;
}

const DEFAULT_STATE: LayoutManagerState = {
    selectedAlgorithm: null,
    interactive: false,
};

const ANIMATION_INTERVAL = 50;

export class LayoutAlgorithmManager extends React.Component<LayoutAlgorithmManagerProps, LayoutManagerState> {
    constructor(props: LayoutAlgorithmManagerProps) {
        super(props);

        const deafaultState = clone(DEFAULT_STATE);
        this.state = merge(defaultStatus, this.props.state);
        this.state.selectedAlgorithm = this.props.algorithms[0];
    }

    private applyCurrentAlgorithm = () => {
        if (!this.state.interactive) {
            this.applyFunction();
        }
    }

    private applyFunction = (interactiveCall?: boolean) => {
        const isSimpleOrFirstCall = !interactiveCall || interactiveCall &&
                                    this.state.selectedAlgorithm.supportAnimation;

        if (this.state.selectedAlgorithm && isSimpleOrFirstCall) {
            this.state.selectedAlgorithm.layoutFunction(this.getParameterSet());
        }
        if (this.state.interactive) {
            setTimeout(() => {
                requestAnimationFrame(() => {
                    this.applyFunction(true);
                });
            }, ANIMATION_INTERVAL);
        }
    }

    private getParameterSet = () => {
        const params: Dictionary<any> = {};
        if (this.state.selectedAlgorithm.parameters) {
            Object.keys(this.state.selectedAlgorithm.parameters || {}).forEach(key => {
                params[key] = this.state.selectedAlgorithm.parameters[key].value;
            });
        }
        params.interactive = this.state.interactive;
        return params;
    }

    private getParameterViews = () => {
        const parametersMap = this.state.selectedAlgorithm.parameters || {};
        const parameters = Object.keys(parametersMap).map(key => parametersMap[key]);
        if (parameters.length === 0) {
            return null;
        }

        return <div className='layout-algorithm-manager_panel__parameters'>
            <div className='layout-parameters-label'>Parameters</div>
            <ul className='layout-parameters-list'>
                {parameters.map((param, index) => {
                    if (isBooleanParamter(param)) {
                        return <div className='layout-parameters-list_boolean-parameter'>
                                <input type='checkbox'
                                    checked={param.value}
                                    key={this.state.selectedAlgorithm.id + `prop-${index}`}
                                    className='layout-parameters-list_boolean-parameter__input'
                                    onChange={(event: React.FormEvent<HTMLInputElement>) => {
                                        param.value = event.currentTarget.checked;
                                    }}
                                />
                                <span className='layout-parameters-list_boolean-parameter__label'>{param.label}</span>
                            </div>;
                    } else if (isStringParamter(param)) {
                        return <div className='layout-parameters-list_string-parameter'>
                            <div className='layout-parameters-list_string-parameter__label'>{param.label}</div>
                            <input type='text'
                                value={param.value}
                                key={this.state.selectedAlgorithm.id + `prop-${index}`}
                                className='layout-parameters-list_string-parameter__input'
                                onChange={(event: React.FormEvent<HTMLInputElement>) => {
                                    param.value = event.currentTarget.value;
                                }}
                            />
                        </div>;
                    } else if (isNumberParamter(param)) {
                        return <AlgorithmNumericParameter
                            {...param}
                            key={this.state.selectedAlgorithm.id + `prop-${index}`}
                            onChange={(newValue) => { param.value = newValue; }}
                        />;
                    } else {
                        return null;
                    }
                })}
            </ul>
        </div>;
    }

    private onClickInteractive = () => {
        this.state.interactive = !this.state.interactive;
        if (this.state.interactive) {
            this.applyFunction();
        }
        this.setState(this.state);
    }

    private onExpandCollapse = () => {
        this.state.isExpanded = !this.state.isExpanded;
        this.setState(this.state);
    }

    private onSelectAlgorithm = (layouAlgorithm: LayouAlgorithm) => {
        this.state.selectedAlgorithm = layouAlgorithm;
        this.setState(this.state);
    }

    render() {
        const algorithms = this.props.algorithms.map(alg => {
            return <li
                key={alg.id}
                className={alg.id === this.state.selectedAlgorithm.id ? 'selected-layout-algorithm' : ''}
                onClick={() => {this.onSelectAlgorithm(alg); }}
            >
                <span className={alg.icon || ''}></span>{alg.label || alg.id}
            </li>;
        });
        return <div className='layout-algorithm-manager'>
            <button type='button' className='layout-algorithm-manager__button'
                    title='Apply layout' onClick={this.applyCurrentAlgorithm}>
                <span className={this.state.selectedAlgorithm.icon} aria-hidden='true'/>&nbsp; 
                {this.state.selectedAlgorithm.label}
            </button>
            <button type='button' className='layout-algorithm-manager__arrow-button'
                    title='See layouts' onClick={this.onExpandCollapse}>
                <span className='fa fa-caret-down' aria-hidden='true'/>
            </button>
            <div
                className={'layout-algorithm-manager_panel' + (this.state.isExpanded ? '' : ' hidden')}
            >   
                <div className='layout-algorithm-manager_panel__title'>Layout manager</div>
                <ul className='layout-algorithm-manager_panel__algorithms'>
                    {algorithms}
                </ul>
                {this.getParameterViews()}
                <div className='layout-algorithm-manager_panel__bottom-line'>
                    <input type='checkbox' checked={this.state.interactive} onClick={this.onClickInteractive}/>
                    <span> interactive</span>
                    <button
                        type='button'
                        className='ontodia-btn ontodia-btn-primary'
                        disabled={this.state.interactive}
                        onClick={this.applyCurrentAlgorithm}
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>;
    }
}

export interface NumericParameterProps extends NumericParameter {
    onChange?: (newValue: number) => void;
}

export class AlgorithmNumericParameter extends React.Component<NumericParameterProps, { value: number }> {
    constructor(props: NumericParameterProps) {
        super(props);
        this.state = { value: props.value };
    }

    componentWillReceiveProps(newProps: NumericParameterProps) {
        this.state.value = newProps.value;
        this.setState(this.state);
    }

    onChangeValue = (event: React.FormEvent<HTMLInputElement>) => {
        const value = event.currentTarget.value;
        this.state.value = +value;
        this.setState(this.state);
        this.props.onChange(this.state.value);
    }

    render() {
        return <div className='layout-parameters-list_number-parameter'>
            <div className='layout-parameters-list_number-parameter__label'>
                {this.props.label}
            </div>
            <div className='layout-parameters-list_number-parameter_value'>
                <input
                    type='range'
                    min={this.props.min}
                    max={this.props.max}
                    value={`${this.state.value}`}
                    className='layout-parameters-list_number-parameter_value__slider'
                    onChange={this.onChangeValue}
                ></input>
                <input
                    type='number'
                    value={`${this.state.value}`}
                    className='layout-parameters-list_number-parameter_value__input'
                    onInput={this.onChangeValue}
                    onChange={() => { /* */ }}
                ></input>
            </div>
        </div>;
    }
}
