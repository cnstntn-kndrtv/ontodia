import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, DemoDataProvider } from '../index';
import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';
import { SnapLines } from './widgets/snapLines';

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }

    const layoutData = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        layoutData,
        dataProvider: new DemoDataProvider(),
        validateLinks: true,
    }).then(() => {
        const view = workspace.getDiagram();
        const model = view.model;
        const widget = createElement(SnapLines, {model});
        view.setCustomWidget({id: 'snapLinesWidget', widget });
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    onSaveDiagram: workspace => {
        const {layoutData} = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(layoutData);
        window.location.reload();
    },
    viewOptions: {
        onIriClick: iri => console.log(iri),
    },
};

onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container));
