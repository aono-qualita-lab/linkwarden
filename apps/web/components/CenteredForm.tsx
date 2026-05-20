import React, { ReactNode } from "react";

interface Props {
  text?: string;
  children: ReactNode;
  "data-testid"?: string;
}

export default function CenteredForm({
  text,
  children,
  "data-testid": dataTestId,
}: Props) {
  return (
    <div
      className="absolute top-0 bottom-0 left-0 right-0 flex justify-center items-center p-5"
      data-testid={dataTestId}
    >
      <div className="m-auto flex flex-col gap-2 w-full">
        {text && (
          <p className="text-lg max-w-[30rem] min-w-80 w-full mx-auto font-semibold px-2 text-center">
            {text}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
