import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';

export async function loader({ request, context }: LoaderFunctionArgs) {
  await context.auth.isAuthenticated(request, {
    successRedirect: '/',
  });
  const session = await context.sessionStorage.getSession(
    request.headers.get('cookie')
  );
  const error = session.get(context.auth.sessionErrorKey);
  return json(
    { error: error?.message },
    {
      headers: {
        'Set-Cookie': await context.sessionStorage.commitSession(session), // You must commit the session whenever you read a flash
      },
    }
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  return await context.auth.authenticate('form', request, {
    successRedirect: '/',
    failureRedirect: '/login',
  });
}

export default function Login() {
  const { error } = useLoaderData<typeof loader>();
  return (
    <Form method="post">
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div>
        <input type="text" placeholder="Username" name="username" defaultValue="atuny0" />
      </div>
      <div>
        <input type="password" placeholder="Password" name="password" defaultValue="9uQFF1Lh" />
      </div>
      <div>
        <button type="submit">Log In</button>
      </div>
      <blockquote>
        (Hint: use username <code>atuny0</code> and password{' '}
        <code>9uQFF1Lh</code> to log in.)
      </blockquote>
    </Form>
  );
}
